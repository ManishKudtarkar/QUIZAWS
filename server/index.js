const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const { GameManager } = require("./game");
const sampleQuiz = require("./sampleQuiz");

const PORT = process.env.PORT || 3000;
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // relaxed for dev; in prod the client is served from the same origin
});

const manager = new GameManager();

// Basic validation so a malformed custom quiz can't crash the server.
function normalizeQuiz(quiz) {
  if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    return sampleQuiz;
  }
  const questions = quiz.questions
    .filter(
      (q) =>
        q &&
        typeof q.text === "string" &&
        Array.isArray(q.answers) &&
        q.answers.length >= 2 &&
        Number.isInteger(q.correctIndex) &&
        q.correctIndex >= 0 &&
        q.correctIndex < q.answers.length
    )
    .map((q) => ({
      text: String(q.text).slice(0, 300),
      answers: q.answers.slice(0, 4).map((a) => String(a).slice(0, 120)),
      correctIndex: q.correctIndex,
      timeLimit:
        Number.isFinite(q.timeLimit) && q.timeLimit >= 5 && q.timeLimit <= 120
          ? Math.round(q.timeLimit)
          : 20,
    }))
    .filter((q) => q.correctIndex < q.answers.length);

  if (questions.length === 0) return sampleQuiz;
  return { title: String(quiz.title || "Untitled Quiz").slice(0, 120), questions };
}

io.on("connection", (socket) => {
  // --- Host creates a game ---
  socket.on("host:create", (payload, ack) => {
    const quiz = normalizeQuiz(payload && payload.quiz);
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
      // Game finished.
      io.to(game.pin).emit("game:ended", { leaderboard: game.leaderboard(100) });
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
