// Persistent storage for finished game results.
// Each record: who played, their scores, the winner, when it happened.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "results.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ results: [] }, null, 2));
  }
}

function readAll() {
  ensureFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(parsed.results) ? parsed.results : [];
  } catch {
    return [];
  }
}

function writeAll(results) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify({ results }, null, 2));
}

const resultsStore = {
  // Save a finished game. `standings` is a sorted array of { name, score }.
  save({ quizTitle, standings, playerCount }) {
    const results = readAll();
    const record = {
      id: crypto.randomUUID(),
      quizTitle: String(quizTitle || "Untitled Quiz").slice(0, 120),
      playedAt: new Date().toISOString(),
      playerCount: playerCount ?? standings.length,
      winner: standings[0] ? standings[0].name : null,
      standings: standings.map((s, i) => ({
        rank: i + 1,
        name: s.name,
        score: s.score,
      })),
    };
    results.unshift(record); // newest first
    writeAll(results);
    return record;
  },

  // Lightweight list for the history screen.
  list() {
    return readAll().map((r) => ({
      id: r.id,
      quizTitle: r.quizTitle,
      playedAt: r.playedAt,
      playerCount: r.playerCount,
      winner: r.winner,
    }));
  },

  get(id) {
    return readAll().find((r) => r.id === id) || null;
  },

  remove(id) {
    const all = readAll();
    const next = all.filter((r) => r.id !== id);
    const removed = next.length !== all.length;
    if (removed) writeAll(next);
    return removed;
  },
};

module.exports = { resultsStore };
