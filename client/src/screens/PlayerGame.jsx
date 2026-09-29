import React, { useEffect, useState } from "react";
import { socket } from "../socket.js";
import { SHAPES } from "../shapes.js";

// Player flow phases:
//   "join"     -> enter PIN + name
//   "waiting"  -> joined, waiting for host to start / next question
//   "question" -> answer options shown
//   "answered" -> waiting for reveal
//   "result"   -> right/wrong + score
//   "ended"    -> game over
// Read a PIN passed in the URL (?pin=123456) so a QR-code scan prefills it.
function pinFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search).get("pin") || "";
    return p.replace(/\D/g, "").slice(0, 6);
  } catch {
    return "";
  }
}

export default function PlayerGame({ onExit }) {
  const [phase, setPhase] = useState("join");
  const [pin, setPin] = useState(pinFromUrl());
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    socket.on("question:show", (q) => {
      setQuestion(q);
      setResult(null);
      setPhase("question");
    });
    socket.on("player:result", (r) => {
      setResult(r);
      setPhase("result");
    });
    socket.on("game:ended", () => {
      setPhase("ended");
    });
    socket.on("game:aborted", ({ reason }) => {
      setMessage(reason || "The game ended.");
      setPhase("ended");
    });

    return () => {
      socket.off("question:show");
      socket.off("player:result");
      socket.off("game:ended");
      socket.off("game:aborted");
    };
  }, []);

  function join() {
    setError("");
    socket.emit("player:join", { pin: pin.trim(), name: name.trim() }, (res) => {
      if (res && res.ok) {
        setTitle(res.title);
        setPhase("waiting");
      } else {
        setError((res && res.error) || "Could not join.");
      }
    });
  }

  function answer(index) {
    socket.emit("player:answer", { answerIndex: index }, (res) => {
      if (res && res.ok) {
        setPhase("answered");
      }
    });
  }

  // ---- Render per phase ----

  if (phase === "join") {
    return (
      <div className="screen center">
        <h1 className="brand">Join a quiz</h1>
        <div className="card">
          <label>Game PIN</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="123456"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            maxLength={6}
          />
          <label>Your name</label>
          <input
            type="text"
            placeholder="Nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            onKeyDown={(e) => e.key === "Enter" && pin && name && join()}
          />
          {error && <div className="error">{error}</div>}
          <div style={{ height: 16 }} />
          <button className="btn-primary" disabled={!pin || !name} onClick={join}>
            Enter
          </button>
          <button className="btn-secondary" style={{ width: "100%", marginTop: 10 }} onClick={onExit}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="screen center">
        <h1 className="brand">You're in!</h1>
        <p className="subtitle">{title}</p>
        <div className="big-status">Waiting for the host to start…</div>
        <span className="player-chip">{name}</span>
      </div>
    );
  }

  if (phase === "question" && question) {
    return (
      <div className="screen">
        <div className="question-header">
          <span className="count-pill">
            Q{question.index + 1} / {question.total}
          </span>
        </div>
        <div className="question-text">{question.text}</div>
        <div className="answers">
          {question.answers.map((a, i) => (
            <button className={`answer-tile a${i}`} key={i} onClick={() => answer(i)}>
              <span className="shape">{SHAPES[i]}</span>
              {a}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === "answered") {
    return (
      <div className="screen center">
        <div className="big-status">Answer locked in ✓</div>
        <p className="subtitle">Waiting for other players…</p>
      </div>
    );
  }

  if (phase === "result" && result) {
    return (
      <div className="screen center">
        <div className="big-status">
          {!result.answered
            ? "Time's up — no answer"
            : result.correct
            ? "Correct! 🎉"
            : "Wrong ✗"}
        </div>
        {result.correct && result.streak > 1 && (
          <div className="count-pill">🔥 {result.streak} in a row</div>
        )}
        <h2 style={{ marginTop: 20 }}>Your score</h2>
        <div className="pin-display" style={{ maxWidth: 260 }}>
          {result.score}
        </div>
        <p className="subtitle">Waiting for the next question…</p>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="screen center">
        <h1 className="brand">Game over</h1>
        {message && <p className="subtitle">{message}</p>}
        <p className="subtitle">Thanks for playing, {name}!</p>
        <button className="btn-primary" style={{ maxWidth: 260 }} onClick={onExit}>
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
