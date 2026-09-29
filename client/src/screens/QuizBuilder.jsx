import React, { useState } from "react";

// Lets the host create a quiz directly in the browser: add questions,
// type up to 4 answers, mark the correct one, set a time limit.

function emptyQuestion() {
  return {
    text: "",
    answers: ["", "", "", ""],
    correctIndex: 0,
    timeLimit: 20,
  };
}

export default function QuizBuilder({ onStart, onExit }) {
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [error, setError] = useState("");

  function updateQuestion(qi, patch) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qi ? { ...q, ...patch } : q))
    );
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

  function validateAndStart() {
    // Build a clean quiz, dropping empty answer slots.
    const cleaned = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const text = q.text.trim();
      const answers = q.answers.map((a) => a.trim()).filter((a) => a.length > 0);
      if (!text) {
        return setError(`Question ${i + 1} needs text.`);
      }
      if (answers.length < 2) {
        return setError(`Question ${i + 1} needs at least 2 answers.`);
      }
      // Ensure the marked-correct answer isn't an empty slot that got dropped.
      const correctText = q.answers[q.correctIndex]?.trim();
      const correctIndex = correctText ? answers.indexOf(correctText) : -1;
      if (correctIndex < 0) {
        return setError(`Question ${i + 1}: mark a non-empty answer as correct.`);
      }
      cleaned.push({
        text,
        answers,
        correctIndex,
        timeLimit: q.timeLimit,
      });
    }
    if (cleaned.length === 0) {
      return setError("Add at least one question.");
    }
    setError("");
    onStart({ title: title.trim() || "My Quiz", questions: cleaned });
  }

  return (
    <div className="screen">
      <div className="card wide">
        <div className="row">
          <h1 style={{ fontSize: "1.8rem" }}>Build your quiz</h1>
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
        <button className="btn-primary" onClick={validateAndStart}>
          Create game
        </button>
      </div>
    </div>
  );
}
