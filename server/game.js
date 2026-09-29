// In-memory game state and core quiz logic.
// A "game" is a single hosted session identified by a numeric PIN.

const POINTS_BASE = 1000;

function generatePin(existingPins) {
  let pin;
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
  } while (existingPins.has(pin));
  return pin;
}

class Game {
  constructor(pin, hostSocketId, quiz) {
    this.pin = pin;
    this.hostSocketId = hostSocketId;
    this.quiz = quiz; // { title, questions: [{ text, answers: [], correctIndex, timeLimit }] }
    this.players = new Map(); // socketId -> { name, score, streak }
    this.state = "lobby"; // lobby | question | reveal | ended
    this.currentQuestionIndex = -1;
    this.questionStartedAt = null;
    this.answersThisQuestion = new Map(); // socketId -> { answerIndex, answeredAt }
  }

  addPlayer(socketId, name) {
    this.players.set(socketId, { name, score: 0, streak: 0 });
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.answersThisQuestion.delete(socketId);
  }

  hasPlayerName(name) {
    const lowered = name.trim().toLowerCase();
    for (const p of this.players.values()) {
      if (p.name.toLowerCase() === lowered) return true;
    }
    return false;
  }

  playerList() {
    return Array.from(this.players.values()).map((p) => ({
      name: p.name,
      score: p.score,
    }));
  }

  get currentQuestion() {
    if (this.currentQuestionIndex < 0) return null;
    return this.quiz.questions[this.currentQuestionIndex] || null;
  }

  get totalQuestions() {
    return this.quiz.questions.length;
  }

  // Advance to the next question. Returns the question payload or null when finished.
  nextQuestion() {
    this.currentQuestionIndex += 1;
    if (this.currentQuestionIndex >= this.totalQuestions) {
      this.state = "ended";
      return null;
    }
    this.state = "question";
    this.questionStartedAt = Date.now();
    this.answersThisQuestion = new Map();
    return this.publicQuestion();
  }

  // Question data safe to send to players/host (no correct answer leaked).
  publicQuestion() {
    const q = this.currentQuestion;
    if (!q) return null;
    return {
      index: this.currentQuestionIndex,
      total: this.totalQuestions,
      text: q.text,
      answers: q.answers,
      timeLimit: q.timeLimit,
    };
  }

  // Record a player's answer. Ignores duplicates and late/invalid submissions.
  submitAnswer(socketId, answerIndex) {
    if (this.state !== "question") return false;
    if (!this.players.has(socketId)) return false;
    if (this.answersThisQuestion.has(socketId)) return false;
    const q = this.currentQuestion;
    if (!q || answerIndex < 0 || answerIndex >= q.answers.length) return false;
    this.answersThisQuestion.set(socketId, {
      answerIndex,
      answeredAt: Date.now(),
    });
    return true;
  }

  // Everyone answered? Lets the host end the question early.
  allAnswered() {
    return (
      this.players.size > 0 &&
      this.answersThisQuestion.size >= this.players.size
    );
  }

  // Score the current question and move to reveal state.
  // Faster correct answers earn more points, up to POINTS_BASE.
  scoreQuestion() {
    const q = this.currentQuestion;
    this.state = "reveal";
    const timeLimitMs = q.timeLimit * 1000;

    for (const [socketId, player] of this.players.entries()) {
      const answer = this.answersThisQuestion.get(socketId);
      const correct = answer && answer.answerIndex === q.correctIndex;
      if (correct) {
        const elapsed = answer.answeredAt - this.questionStartedAt;
        const fraction = Math.max(0, 1 - elapsed / timeLimitMs);
        const points = Math.round(POINTS_BASE * (0.5 + 0.5 * fraction));
        player.score += points;
        player.streak += 1;
      } else {
        player.streak = 0;
      }
    }

    return this.questionResults();
  }

  questionResults() {
    const q = this.currentQuestion;
    // Count how many chose each answer.
    const distribution = new Array(q.answers.length).fill(0);
    for (const a of this.answersThisQuestion.values()) {
      distribution[a.answerIndex] += 1;
    }
    return {
      correctIndex: q.correctIndex,
      distribution,
      leaderboard: this.leaderboard(),
    };
  }

  // Per-player result, used to tell each player if they were right.
  playerResult(socketId) {
    const q = this.currentQuestion;
    const answer = this.answersThisQuestion.get(socketId);
    const player = this.players.get(socketId);
    const correct = !!answer && answer.answerIndex === q.correctIndex;
    return {
      correct,
      answered: !!answer,
      score: player ? player.score : 0,
      streak: player ? player.streak : 0,
    };
  }

  leaderboard(limit = 5) {
    return Array.from(this.players.values())
      .map((p) => ({ name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

class GameManager {
  constructor() {
    this.games = new Map(); // pin -> Game
    this.socketToPin = new Map(); // socketId -> pin (players and hosts)
  }

  createGame(hostSocketId, quiz) {
    const pin = generatePin(new Set(this.games.keys()));
    const game = new Game(pin, hostSocketId, quiz);
    this.games.set(pin, game);
    this.socketToPin.set(hostSocketId, pin);
    return game;
  }

  getGame(pin) {
    return this.games.get(pin) || null;
  }

  getGameBySocket(socketId) {
    const pin = this.socketToPin.get(socketId);
    return pin ? this.getGame(pin) : null;
  }

  bindSocket(socketId, pin) {
    this.socketToPin.set(socketId, pin);
  }

  // Handle a disconnect. Returns { game, wasHost } so the caller can notify the room.
  handleDisconnect(socketId) {
    const pin = this.socketToPin.get(socketId);
    if (!pin) return null;
    this.socketToPin.delete(socketId);
    const game = this.games.get(pin);
    if (!game) return null;

    if (game.hostSocketId === socketId) {
      this.games.delete(pin);
      return { game, wasHost: true };
    }
    game.removePlayer(socketId);
    return { game, wasHost: false };
  }

  endGame(pin) {
    this.games.delete(pin);
  }
}

module.exports = { GameManager, Game };
