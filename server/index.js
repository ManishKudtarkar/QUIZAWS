const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const { GameManager } = require("./game");
const sampleQuiz = require("./sampleQuiz");
const { store, normalizeQuizContent } = require("./quizStore");
const { resultsStore } = require("./resultsStore");
const { csvToQuiz, toCSV } = require("./csv");

const PORT = process.env.PORT || 3000;
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: "text/csv", limit: "2mb" }));
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // relaxed for dev; in prod the client is served from the same origin
});

const manager = new GameManager();

// Basic validation so a malformed custom quiz can't crash the server.
// Falls back to the sample quiz when nothing valid is provided.
function normalizeQuiz(quiz) {
  const cleaned = normalizeQuizContent(quiz);
  return cleaned || sampleQuiz;
}

// --- REST API: persistent quizzes ---
app.get("/api/quizzes", (_req, res) => {
  res.json({ quizzes: store.list() });
});

app.get("/api/quizzes/:id", (req, res) => {
  const quiz = store.get(req.params.id);
  if (!quiz) return res.status(404).json({ error: "Quiz not found." });
  res.json({ quiz });
});

app.post("/api/quizzes", (req, res) => {
  const saved = store.save(req.body || {});
  if (!saved) {
    return res
      .status(400)
      .json({ error: "Invalid quiz. Need a title and at least one valid question." });
  }
  res.json({ quiz: saved });
});

app.delete("/api/quizzes/:id", (req, res) => {
  const removed = store.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: "Quiz not found." });
  res.json({ ok: true });
});

// Import a quiz from CSV. Body may be raw CSV text (Content-Type: text/csv)
// or JSON { title, csv }. Parses, validates, saves, and returns the new quiz.
app.post("/api/quizzes/import", (req, res) => {
  let csvText = "";
  let title = "Imported Quiz";
  if (typeof req.body === "string") {
    csvText = req.body;
    title = String(req.query.title || title);
  } else if (req.body && typeof req.body.csv === "string") {
    csvText = req.body.csv;
    title = String(req.body.title || title);
  }
  if (!csvText.trim()) {
    return res.status(400).json({ error: "No CSV content provided." });
  }

  const { quiz, warnings } = csvToQuiz(csvText, title);
  if (!quiz) {
    return res.status(400).json({
      error: "Could not import. " + (warnings[0] || "No valid questions found."),
      warnings,
    });
  }
  const saved = store.save(quiz);
  if (!saved) {
    return res.status(400).json({ error: "Import produced an invalid quiz." });
  }
  res.json({ quiz: saved, warnings });
});

// --- REST API: saved game results (history) ---
app.get("/api/results", (_req, res) => {
  res.json({ results: resultsStore.list() });
});

app.get("/api/results/:id", (req, res) => {
  const result = resultsStore.get(req.params.id);
  if (!result) return res.status(404).json({ error: "Result not found." });
  res.json({ result });
});

// Download one game's results as a CSV file.
app.get("/api/results/:id/csv", (req, res) => {
  const result = resultsStore.get(req.params.id);
  if (!result) return res.status(404).json({ error: "Result not found." });

  const rows = [["Rank", "Name", "Score"]];
  for (const s of result.standings) {
    rows.push([s.rank, s.name, s.score]);
  }
  const csv = toCSV(rows);
  const safeTitle = result.quizTitle.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="results_${safeTitle}_${result.id.slice(0, 8)}.csv"`
  );
  res.send(csv);
});

app.delete("/api/results/:id", (req, res) => {
  const removed = resultsStore.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: "Result not found." });
  res.json({ ok: true });
});

io.on("connection", (socket) => {
  // --- Host creates a game ---
  // Accepts either a saved quizId (preferred) or an inline quiz object.
  socket.on("host:create", (payload, ack) => {
    let quiz;
    if (payload && payload.quizId) {
      const saved = store.get(payload.quizId);
      if (!saved) {
        return ack && ack({ ok: false, error: "Saved quiz not found." });
      }
      quiz = { title: saved.title, questions: saved.questions };
    } else {
      quiz = normalizeQuiz(payload && payload.quiz);
    }
    const game = manager.createGame(socket.id, quiz);
    socket.join(game.pin);
    if (typeof ack === "function") {
      ack({ ok: true, pin: game.pin, title: quiz.title, total: game.totalQuestions });
    }
  });

  // --- Player joins a game ---
  socket.on("player:join", ({ pin, name }, ack) => {
    const game = manager.getGame(String(pin || "").trim());
    if (!game) {
      return ack && ack({ ok: false, error: "Game not found. Check the PIN." });
    }
    if (game.state !== "lobby") {
      return ack && ack({ ok: false, error: "This game has already started." });
    }
    const cleanName = String(name || "").trim().slice(0, 20);
    if (!cleanName) {
      return ack && ack({ ok: false, error: "Please enter a name." });
    }
    if (game.hasPlayerName(cleanName)) {
      return ack && ack({ ok: false, error: "That name is taken." });
    }

    game.addPlayer(socket.id, cleanName);
    manager.bindSocket(socket.id, game.pin);
    socket.join(game.pin);

    ack && ack({ ok: true, pin: game.pin, title: game.quiz.title });
    // Tell the host (and everyone) about the updated lobby.
    io.to(game.pin).emit("lobby:update", { players: game.playerList() });
  });

  // --- Host starts the game / advances questions ---
  socket.on("host:next", (_payload, ack) => {
    const game = manager.getGameBySocket(socket.id);
    if (!game || game.hostSocketId !== socket.id) {
      return ack && ack({ ok: false, error: "Not authorized." });
    }
    const question = game.nextQuestion();
    if (!question) {
      // Game finished — persist the final results before ending.
      const standings = game.leaderboard(1000);
      try {
        resultsStore.save({
          quizTitle: game.quiz.title,
          standings,
          playerCount: game.players.size,
        });
      } catch (e) {
        console.error("Failed to save results:", e.message);
      }
      io.to(game.pin).emit("game:ended", { leaderboard: standings });
      return ack && ack({ ok: true, ended: true });
    }
    io.to(game.pin).emit("question:show", question);
    ack && ack({ ok: true, ended: false });
  });

  // --- Host ends current question early / on timer ---
  socket.on("host:endQuestion", (_payload, ack) => {
    const game = manager.getGameBySocket(socket.id);
    if (!game || game.hostSocketId !== socket.id) {
      return ack && ack({ ok: false, error: "Not authorized." });
    }
    if (game.state !== "question") {
      return ack && ack({ ok: false, error: "No active question." });
    }
    const results = game.scoreQuestion();
    // Host sees full results.
    io.to(game.pin).emit("question:results", results);
    // Each player sees their personal outcome.
    for (const socketId of game.players.keys()) {
      io.to(socketId).emit("player:result", game.playerResult(socketId));
    }
    ack && ack({ ok: true });
  });

  // --- Player submits an answer ---
  socket.on("player:answer", ({ answerIndex }, ack) => {
    const game = manager.getGameBySocket(socket.id);
    if (!game) return ack && ack({ ok: false });
    const accepted = game.submitAnswer(socket.id, answerIndex);
    ack && ack({ ok: accepted });
    if (accepted) {
      // Let the host know how many have answered.
      io.to(game.hostSocketId).emit("answers:count", {
        answered: game.answersThisQuestion.size,
        total: game.players.size,
      });
      if (game.allAnswered()) {
        io.to(game.hostSocketId).emit("answers:allIn");
      }
    }
  });

  socket.on("disconnect", () => {
    const result = manager.handleDisconnect(socket.id);
    if (!result) return;
    const { game, wasHost } = result;
    if (wasHost) {
      // Host left: tell players the game is over.
      io.to(game.pin).emit("game:aborted", { reason: "Host disconnected." });
    } else {
      io.to(game.pin).emit("lobby:update", { players: game.playerList() });
    }
  });
});

// --- Serve the built React client (production) ---
app.use(express.static(CLIENT_DIST));
app.get("*", (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, "index.html"));
});

server.listen(PORT, () => {
  console.log(`Kahoot-clone server listening on port ${PORT}`);
});
