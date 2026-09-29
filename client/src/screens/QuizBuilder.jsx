import React, { useEffect, useState } from "react";

// Create or edit a quiz in the browser, then SAVE it to the server so it
// persists across refreshes and restarts. Saving returns to the quiz list.
//   editId (optional) -> load an existing quiz to edit
//   onSaved(quiz)      -> called after a successful save
//   onExit()           -> back without saving

function emptyQuestion() {
  return {
    text: "",
    answers: ["", "", "", ""],
    correctIndex: 0,
    timeLimit: 20,
  };
}

export default function QuizBuilder({ editId, onSaved, onExit }) {
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);

  // If editing, load the saved quiz and hydrate the form.
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const res = await fetch(`/api/quizzes/${editId}`);
        const data = await res.json();
        if (data.quiz) {
          setTitle(data.quiz.title);
          // Pad answers back to 4 slots for editing convenience.
          setQuestions(
            data.quiz.questions.map((q) => ({
              text: q.text,
              answers: [...q.answers, "", "", "", ""].slice(0, 4),
              correctIndex: q.correctIndex,
              timeLimit: q.timeLimit,
            }))
          );
        }
      } catch {
        setError("Could not load that quiz.");
      } finally {
        setLoading(false);
      }
    })();
  }, [editId]);

  function updateQuestion(qi, patch) {
    setQuestions((prev) => prev.map((q, i) => (i === qi ? { ...q, ...patch } : q)));
  }

  function updateAnswer(qi, ai, value) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qi
          ? { ...q, answers: q.answers.map((a, j) => (j === ai ? value : a)) }
          : q
      )
    );
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function removeQuestion(qi) {
    setQuestions((prev) => prev.filter((_, i) => i !== qi));
  }

  function buildCleanQuiz() {
    const cleaned = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const text = q.text.trim();
      const answers = q.answers.map((a) => a.trim()).filter((a) => a.length > 0);
      if (!text) {
        setError(`Question ${i + 1} needs text.`);
        return null;
      }
      if (answers.length < 2) {
        setError(`Question ${i + 1} needs at least 2 answers.`);
        return null;
      }
      const correctText = q.answers[q.correctIndex]?.trim();
      const correctIndex = correctText ? answers.indexOf(correctText) : -1;
      if (correctIndex < 0) {
        setError(`Question ${i + 1}: mark a non-empty answer as correct.`);
        return null;
      }
      cleaned.push({ text, answers, correctIndex, timeLimit: q.timeLimit });
    }
    if (cleaned.length === 0) {
      setError("Add at least one question.");
      return null;
    }
    setError("");
    return { title: title.trim() || "My Quiz", questions: cleaned };
  }

  async function save() {
    const quiz = buildCleanQuiz();
    if (!quiz) return;
    setSaving(true);
    try {
      const res = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { ...quiz, id: editId } : quiz),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save the quiz.");
        return;
      }
      onSaved(data.quiz);
    } catch {
      setError("Could not save the quiz. Is the server running?");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="screen center">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="card wide">
        <div className="row">
          <h1 style={{ fontSize: "1.8rem" }}>{editId ? "Edit quiz" : "Build your quiz"}</h1>
          <span className="spacer" />
          <button className="btn-secondary" onClick={onExit}>
            Back
          </button>
        </div>

        <label>Quiz title</label>
        <input
          type="text"
          placeholder="e.g. Biology Chapter 3"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />

        <div style={{ height: 20 }} />

        {questions.map((q, qi) => (
          <div className="builder-question" key={qi}>
            <div className="row">
              <span className="badge">Question {qi + 1}</span>
              <span className="spacer" />
              {questions.length > 1 && (
                <button
                  className="btn-secondary"
                  style={{ padding: "6px 12px" }}
                  onClick={() => removeQuestion(qi)}
                >
                  Remove
                </button>
              )}
            </div>

            <label>Question text</label>
            <input
              type="text"
              placeholder="Type your question"
              value={q.text}
              onChange={(e) => updateQuestion(qi, { text: e.target.value })}
              maxLength={300}
            />

            <label>Answers (select the correct one)</label>
            {q.answers.map((a, ai) => (
              <div className="builder-answer-row" key={ai}>
                <input
                  type="radio"
                  name={`correct-${qi}`}
                  checked={q.correctIndex === ai}
                  onChange={() => updateQuestion(qi, { correctIndex: ai })}
                  aria-label={`Mark answer ${ai + 1} correct`}
                />
                <input
                  type="text"
                  placeholder={`Answer ${ai + 1}${ai > 1 ? " (optional)" : ""}`}
                  value={a}
                  onChange={(e) => updateAnswer(qi, ai, e.target.value)}
                  maxLength={120}
                />
              </div>
            ))}

            <label>Time limit (seconds)</label>
            <input
              type="number"
              min={5}
              max={120}
              value={q.timeLimit}
              onChange={(e) =>
                updateQuestion(qi, {
                  timeLimit: Math.max(5, Math.min(120, Number(e.target.value) || 20)),
                })
              }
              style={{ maxWidth: 120 }}
            />
          </div>
        ))}

        <button className="btn-secondary" onClick={addQuestion}>
          + Add question
        </button>

        {error && <div className="error">{error}</div>}

        <div style={{ height: 20 }} />
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : editId ? "Save changes" : "Save quiz"}
        </button>
      </div>
    </div>
  );
}
