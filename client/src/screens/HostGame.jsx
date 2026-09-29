import React, { useEffect, useRef, useState } from "react";
import { socket } from "../socket.js";
import { SHAPES } from "../shapes.js";
import QuizBuilder from "./QuizBuilder.jsx";

// Host flow phases:
//   "build"    -> QuizBuilder
//   "lobby"    -> show PIN, wait for players
//   "question" -> question is live, players answering
//   "reveal"   -> show correct answer + leaderboard
//   "ended"    -> final leaderboard
export default function HostGame({ onExit }) {
  const [phase, setPhase] = useState("build");
  const [pin, setPin] = useState("");
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState(0);
  const [players, setPlayers] = useState([]);
  const [question, setQuestion] = useState(null);
  const [results, setResults] = useState(null);
  const [finalBoard, setFinalBoard] = useState([]);
  const [answerCount, setAnswerCount] = useState({ answered: 0, total: 0 });
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef(null);

  // Wire up socket listeners once.
  useEffect(() => {
    socket.on("lobby:update", ({ players }) => setPlayers(players));
    socket.on("answers:count", (c) => setAnswerCount(c));
    socket.on("answers:allIn", () => endQuestion());
    socket.on("question:results", (r) => {
      stopTimer();
      setResults(r);
      setPhase("reveal");
    });
    socket.on("game:ended", ({ leaderboard }) => {
      stopTimer();
      setFinalBoard(leaderboard);
      setPhase("ended");
    });

    return () => {
      socket.off("lobby:update");
      socket.off("answers:count");
      socket.off("answers:allIn");
      socket.off("question:results");
      socket.off("game:ended");
      stopTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startTimer(seconds) {
    stopTimer();
    setSecondsLeft(seconds);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          stopTimer();
          endQuestion();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  function createGame(quiz) {
    socket.emit("host:create", { quiz }, (res) => {
      if (res && res.ok) {
        setPin(res.pin);
        setTitle(res.title);
        setTotal(res.total);
        setPhase("lobby");
      }
    });
  }

  function nextQuestion() {
    socket.emit("host:next", {}, (res) => {
      if (!res || !res.ok) return;
      if (res.ended) return; // game:ended event handles UI
    });
    // The question:show event drives what the players see; the host mirrors it.
    socket.once("question:show", (q) => {
      setQuestion(q);
      setResults(null);
      setAnswerCount({ answered: 0, total: players.length });
      setPhase("question");
      startTimer(q.timeLimit);
    });
  }

  function endQuestion() {
    socket.emit("host:endQuestion", {}, () => {});
  }

  // ---- Render per phase ----

  if (phase === "build") {
    return <QuizBuilder onStart={createGame} onExit={onExit} />;
  }

  if (phase === "lobby") {
    return (
      <div className="screen center">
        <h1 className="brand">{title}</h1>
        <p className="subtitle">Students join at this site with the PIN:</p>
        <div className="pin-display">{pin}</div>
        <div className="count-pill">
          {players.length} player{players.length === 1 ? "" : "s"} joined
        </div>
        <div className="players-grid">
          {players.map((p) => (
            <span className="player-chip" key={p.name}>
              {p.name}
            </span>
          ))}
        </div>
        <div style={{ height: 16 }} />
        <button
          className="btn-primary"
          style={{ maxWidth: 300 }}
          disabled={players.length === 0}
          onClick={nextQuestion}
        >
          Start quiz
        </button>
        <button className="btn-ghost" onClick={onExit}>
          Cancel
        </button>
      </div>
    );
  }

  if (phase === "question" && question) {
    return (
      <div className="screen">
        <div className="question-header">
          <div className="row">
            <span className="count-pill">
              Q{question.index + 1} / {question.total}
            </span>
            <span className="spacer" />
            <div className="timer">{secondsLeft}</div>
          </div>
        </div>
        <div className="question-text">{question.text}</div>
        <div className="count-pill">
          {answerCount.answered} / {players.length} answered
        </div>
        <div className="answers">
          {question.answers.map((a, i) => (
            <div className={`answer-tile a${i}`} key={i}>
              <span className="shape">{SHAPES[i]}</span>
              {a}
            </div>
          ))}
        </div>
        <div style={{ height: 20 }} />
        <button className="btn-secondary" onClick={endQuestion}>
          Skip / end question
        </button>
      </div>
    );
  }

  if (phase === "reveal" && results && question) {
    return (
      <div className="screen">
        <div className="question-text">{question.text}</div>
        <div className="answers">
          {question.answers.map((a, i) => (
            <div
              className={`answer-tile a${i} ${
                i === results.correctIndex ? "correct" : "dim"
              }`}
              key={i}
            >
              <span className="shape">{SHAPES[i]}</span>
              {a}
              <span className="spacer" />
              <span>{results.distribution[i] || 0}</span>
            </div>
          ))}
        </div>

        <h2 style={{ marginTop: 28 }}>Leaderboard</h2>
        <ol className="leaderboard">
          {results.leaderboard.map((p, i) => (
            <li key={p.name}>
              <span className="rank">{i + 1}</span>
              {p.name}
              <span className="score">{p.score}</span>
            </li>
          ))}
        </ol>

        <button className="btn-primary" style={{ maxWidth: 300 }} onClick={nextQuestion}>
          {question.index + 1 >= question.total ? "Show final results" : "Next question"}
        </button>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="screen center">
        <h1 className="brand">🏆 Final Results</h1>
        <ol className="leaderboard">
          {finalBoard.map((p, i) => (
            <li key={p.name}>
              <span className="rank">{i + 1}</span>
              {p.name}
              <span className="score">{p.score}</span>
            </li>
          ))}
        </ol>
        <button className="btn-primary" style={{ maxWidth: 300 }} onClick={onExit}>
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="screen center">
      <p>Loading…</p>
    </div>
  );
}
