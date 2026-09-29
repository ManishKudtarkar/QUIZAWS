import React, { useEffect, useRef, useState } from "react";
import { socket } from "../socket.js";
import { SHAPES } from "../shapes.js";
import QuizBuilder from "./QuizBuilder.jsx";
import MyQuizzes from "./MyQuizzes.jsx";
import QRCode from "../components/QRCode.jsx";

// Host flow phases:
//   "list"     -> MyQuizzes (saved quizzes; Go Live / Edit / Create)
//   "build"    -> QuizBuilder (create new)
//   "edit"     -> QuizBuilder (edit existing)
//   "lobby"    -> show PIN + QR, wait for players
//   "question" -> question is live, players answering
//   "reveal"   -> show correct answer + leaderboard
//   "ended"    -> final leaderboard
export default function HostGame({ onExit }) {
  const [phase, setPhase] = useState("list");
  const [editId, setEditId] = useState(null);
  const [pin, setPin] = useState("");
  const [title, setTitle] = useState("");
  const [players, setPlayers] = useState([]);
  const [question, setQuestion] = useState(null);
  const [results, setResults] = useState(null);
  const [finalBoard, setFinalBoard] = useState([]);
  const [answerCount, setAnswerCount] = useState({ answered: 0, total: 0 });
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef(null);

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

  // Go live with a saved quiz (by id).
  function goLive(quizId) {
    socket.emit("host:create", { quizId }, (res) => {
      if (res && res.ok) {
        setPin(res.pin);
        setTitle(res.title);
        setPlayers([]);
        setPhase("lobby");
      }
    });
  }

  function nextQuestion() {
    socket.emit("host:next", {}, (res) => {
      if (!res || !res.ok) return;
    });
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

  // Join URL for the QR code: same origin, prefilled with the PIN.
  const joinUrl = `${window.location.origin}/?pin=${pin}`;

  // ---- Render per phase ----

  if (phase === "list") {
    return (
      <MyQuizzes
        onGoLive={goLive}
        onCreate={() => {
          setEditId(null);
          setPhase("build");
        }}
        onEdit={(id) => {
          setEditId(id);
          setPhase("edit");
        }}
        onExit={onExit}
      />
    );
  }

  if (phase === "build" || phase === "edit") {
    return (
      <QuizBuilder
        editId={phase === "edit" ? editId : null}
        onSaved={() => setPhase("list")}
        onExit={() => setPhase("list")}
      />
    );
  }

  if (phase === "lobby") {
    return (
      <div className="screen center">
        <h1 className="brand">{title}</h1>
        <p className="subtitle">Scan the QR code, or go to the site and enter the PIN.</p>

        <div className="lobby-join">
          <div className="pin-block">
            <div className="pin-label">Game PIN</div>
            <div className="pin-display">{pin}</div>
          </div>
          <div className="qr-block">
            <QRCode text={joinUrl} size={200} />
            <div className="join-url">{joinUrl}</div>
          </div>
        </div>

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
        <button className="btn-ghost" onClick={() => setPhase("list")}>
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
        <button className="btn-primary" style={{ maxWidth: 300 }} onClick={() => setPhase("list")}>
          Back to my quizzes
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
