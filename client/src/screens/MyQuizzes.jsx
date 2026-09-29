import React, { useEffect, useState } from "react";

// Lists the host's saved quizzes (loaded from the server). Lets the host
// go live with one, edit it, delete it, or create a new one.
export default function MyQuizzes({ onGoLive, onCreate, onImport, onEdit, onExit }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/quizzes");
      const data = await res.json();
      setQuizzes(data.quizzes || []);
    } catch {
      setError("Could not load your quizzes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id) {
    if (!confirm("Delete this quiz? This cannot be undone.")) return;
    try {
      await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
      setQuizzes((prev) => prev.filter((q) => q.id !== id));
    } catch {
      setError("Could not delete that quiz.");
    }
  }

  return (
    <div className="screen">
      <div className="card wide">
        <div className="row">
          <h1 style={{ fontSize: "1.8rem" }}>My quizzes</h1>
          <span className="spacer" />
          <button className="btn-secondary" onClick={onExit}>
            Back
          </button>
        </div>

        <div style={{ height: 12 }} />
        <div className="row wrap">
          <button className="btn-primary" style={{ width: "auto", flex: 1 }} onClick={onCreate}>
            + Create new quiz
          </button>
          <button className="btn-secondary" onClick={onImport}>
            ⬆ Import from sheet (CSV)
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <div style={{ height: 20 }} />

        {loading ? (
          <p>Loading…</p>
        ) : quizzes.length === 0 ? (
          <p style={{ color: "#555" }}>
            No saved quizzes yet. Create one — it'll be saved so you can host it
            anytime.
          </p>
        ) : (
          quizzes.map((q) => (
            <div className="builder-question" key={q.id} style={{ marginBottom: 12 }}>
              <div className="row wrap">
                <div>
                  <strong style={{ fontSize: "1.1rem" }}>{q.title}</strong>
                  <div style={{ color: "#666", fontSize: "0.9rem" }}>
                    {q.questionCount} question{q.questionCount === 1 ? "" : "s"}
                  </div>
                </div>
                <span className="spacer" />
                <button
                  className="btn-primary"
                  style={{ width: "auto", padding: "10px 18px" }}
                  onClick={() => onGoLive(q.id)}
                >
                  ▶ Go Live
                </button>
                <button
                  className="btn-secondary"
                  style={{ padding: "10px 14px" }}
                  onClick={() => onEdit(q.id)}
                >
                  Edit
                </button>
                <button
                  className="btn-secondary"
                  style={{ padding: "10px 14px" }}
                  onClick={() => remove(q.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
