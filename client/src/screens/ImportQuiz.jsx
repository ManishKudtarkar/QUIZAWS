import React, { useRef, useState } from "react";

// Import a quiz from a CSV sheet: upload a .csv file OR paste rows.
// Also offers a downloadable template so hosts know the exact format.

const TEMPLATE =
  "question,answer1,answer2,answer3,answer4,correct,timeLimit\n" +
  "What is the capital of France?,London,Paris,Berlin,Madrid,2,20\n" +
  "Which planet is the Red Planet?,Venus,Mars,Jupiter,,2,20\n" +
  "What is 7 x 8?,54,56,62,48,2,15\n";

export default function ImportQuiz({ onImported, onExit }) {
  const [title, setTitle] = useState("");
  const [csv, setCsv] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    // Default the title to the file name (without extension).
    if (!title) setTitle(file.name.replace(/\.csv$/i, ""));
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ""));
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quiz-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport() {
    setError("");
    setWarnings([]);
    if (!csv.trim()) {
      setError("Upload a CSV file or paste some rows first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/quizzes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || "Imported Quiz", csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed.");
        setWarnings(data.warnings || []);
        return;
      }
      // Success. Surface any per-row warnings but still proceed.
      onImported(data.quiz, data.warnings || []);
    } catch {
      setError("Import failed. Is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="card wide">
        <div className="row">
          <h1 style={{ fontSize: "1.8rem" }}>Import quiz from a sheet</h1>
          <span className="spacer" />
          <button className="btn-secondary" onClick={onExit}>
            Back
          </button>
        </div>

        <p style={{ color: "#555" }}>
          Prepare your questions in Excel or Google Sheets, export as CSV, then
          upload it here. Columns: <code>question, answer1, answer2, answer3,
          answer4, correct, timeLimit</code>. The <code>correct</code> column is
          the answer number (1–4). Leave unused answer columns blank.
        </p>

        <button className="btn-secondary" onClick={downloadTemplate}>
          ⬇ Download template CSV
        </button>

        <label>Quiz title</label>
        <input
          type="text"
          placeholder="e.g. History Quiz"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />

        <label>Upload a .csv file</label>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} />

        <label>…or paste rows here</label>
        <textarea
          rows={8}
          placeholder={TEMPLATE}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          style={{ fontFamily: "monospace", fontSize: "0.9rem" }}
        />

        {error && <div className="error">{error}</div>}
        {warnings.length > 0 && (
          <div className="warn">
            <strong>Some rows were skipped:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
              {warnings.slice(0, 8).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ height: 20 }} />
        <button className="btn-primary" onClick={doImport} disabled={busy}>
          {busy ? "Importing…" : "Import & save quiz"}
        </button>
      </div>
    </div>
  );
}
