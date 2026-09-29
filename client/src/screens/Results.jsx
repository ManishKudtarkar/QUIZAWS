import React, { useEffect, useState } from "react";

// Past game results: a list of finished games (who won, when, how many players),
// with a detail view showing full standings and a CSV download.
export default function Results({ onExit }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null); // full result detail

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/results");
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setError("Could not load results.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function open(id) {
    try {
      const res = await fetch(`/api/results/${id}`);
      const data = await res.json();
      setSelected(data.result);
    } catch {
      setError("Could not open that result.");
    }
  }

  async function remove(id) {
    if (!confirm("Delete this result?")) return;
    try {
      await fetch(`/api/results/${id}`, { method: "DELETE" });
      setResults((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError("Could not delete that result.");
    }
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  // ---- Detail view ----
  if (selected) {
    return (
      <div className="screen">
        <div className="card wide">
          <div className="row">
            <h1 style={{ fontSize: "1.6rem" }}>{selected.quizTitle}</h1>
            <span className="spacer" />
            <button className="btn-secondary" onClick={() => setSelected(null)}>
              Back to list
            </button>
          </div>
          <p style={{ color: "#666" }}>
            {fmtDate(selected.playedAt)} · {selected.playerCount} player
            {selected.playerCount === 1 ? "" : "s"}
          </p>

          <a
            className="btn-primary"
            style={{ display: "inline-block", textDecoration: "none", textAlign: "center" }}
            href={`/api/results/${selected.id}/csv`}
          >
            ⬇ Download results as CSV
          </a>

          <ol className="leaderboard" style={{ maxWidth: "100%", marginTop: 20 }}>
            {selected.standings.map((s) => (
              <li key={s.rank}>
                <span className="rank">{s.rank}</span>
                {s.name}
                <span className="score">{s.score}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="screen">
      <div className="card wide">
        <div className="row">
          <h1 style={{ fontSize: "1.8rem" }}>Past results</h1>
          <span className="spacer" />
          <button className="btn-secondary" onClick={onExit}>
            Back
          </button>
        </div>

        {error && <div className="error">{error}</div>}
        <div style={{ height: 16 }} />

        {loading ? (
          <p>Loading…</p>
        ) : results.length === 0 ? (
          <p style={{ color: "#555" }}>
            No results yet. Finished games will be saved here automatically.
          </p>
        ) : (
          results.map((r) => (
            <div className="builder-question" key={r.id} style={{ marginBottom: 12 }}>
              <div className="row wrap">
                <div>
                  <strong style={{ fontSize: "1.1rem" }}>{r.quizTitle}</strong>
                  <div style={{ color: "#666", fontSize: "0.9rem" }}>
                    {fmtDate(r.playedAt)} · {r.playerCount} player
                    {r.playerCount === 1 ? "" : "s"}
                    {r.winner ? ` · 🏆 ${r.winner}` : ""}
                  </div>
                </div>
                <span className="spacer" />
                <button
                  className="btn-primary"
                  style={{ width: "auto", padding: "10px 18px" }}
                  onClick={() => open(r.id)}
                >
                  View
                </button>
                <a
                  className="btn-secondary"
                  style={{ padding: "10px 14px", textDecoration: "none" }}
                  href={`/api/results/${r.id}/csv`}
                >
                  CSV
                </a>
                <button
                  className="btn-secondary"
                  style={{ padding: "10px 14px" }}
                  onClick={() => remove(r.id)}
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
