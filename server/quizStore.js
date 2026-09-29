// Persistent quiz storage backed by a single JSON file on disk.
// Survives page refreshes and server restarts (as long as the disk persists).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "quizzes.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ quizzes: [] }, null, 2));
  }
}

function readAll() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.quizzes) ? parsed.quizzes : [];
  } catch {
    // Corrupt or unreadable file: start fresh rather than crash.
    return [];
  }
}

function writeAll(quizzes) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify({ quizzes }, null, 2));
}

// Validate + clean a quiz coming from the client. Returns a normalized quiz
// object (without id/meta) or null if it's invalid.
function normalizeQuizContent(quiz) {
  if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    return null;
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

  if (questions.length === 0) return null;
  return {
    title: String(quiz.title || "Untitled Quiz").slice(0, 120),
    questions,
  };
}

const store = {
  // Return quizzes with lightweight metadata (no need to send every question for the list).
  list() {
    return readAll().map((q) => ({
      id: q.id,
      title: q.title,
      questionCount: q.questions.length,
      updatedAt: q.updatedAt,
    }));
  },

  get(id) {
    return readAll().find((q) => q.id === id) || null;
  },

  // Create a new quiz (or overwrite when an existing id is provided). Returns
  // the saved quiz, or null if the content is invalid.
  save(quiz) {
    const content = normalizeQuizContent(quiz);
    if (!content) return null;

    const quizzes = readAll();
    const now = new Date().toISOString();

    if (quiz.id) {
      const idx = quizzes.findIndex((q) => q.id === quiz.id);
      if (idx >= 0) {
        quizzes[idx] = { ...quizzes[idx], ...content, updatedAt: now };
        writeAll(quizzes);
        return quizzes[idx];
      }
    }

    const record = {
      id: crypto.randomUUID(),
      ...content,
      createdAt: now,
      updatedAt: now,
    };
    quizzes.push(record);
    writeAll(quizzes);
    return record;
  },

  remove(id) {
    const quizzes = readAll();
    const next = quizzes.filter((q) => q.id !== id);
    const removed = next.length !== quizzes.length;
    if (removed) writeAll(next);
    return removed;
  },
};

module.exports = { store, normalizeQuizContent };
