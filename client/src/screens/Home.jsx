import React from "react";

export default function Home({ onHost, onJoin }) {
  return (
    <div className="screen center">
      <h1 className="brand">QuizHost</h1>
      <p className="subtitle">Create a live quiz. Students join and play in real time.</p>
      <div className="card">
        <button className="btn-primary" onClick={onHost}>
          Host a quiz
        </button>
        <div style={{ height: 12 }} />
        <button className="btn-secondary" style={{ width: "100%" }} onClick={onJoin}>
          Join a quiz
        </button>
      </div>
    </div>
  );
}
