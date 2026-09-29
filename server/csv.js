// Minimal CSV utilities — no external dependency.
// Handles quoted fields, escaped quotes ("" inside quotes), and commas/newlines
// inside quoted fields.

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const s = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Flush the last field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Expected columns (header optional, matched case-insensitively):
//   question, answer1, answer2, answer3, answer4, correct, timeLimit
// - "correct" is 1-based (answer number). Also accepts letters A-D.
// - Empty answer columns are ignored.
// Returns { title, questions } plus a list of per-row warnings for skipped rows.
function csvToQuiz(text, fallbackTitle = "Imported Quiz") {
  const rows = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) {
    return { quiz: null, warnings: ["The file is empty."] };
  }

  // Detect a header row: first cell looks like "question".
  let start = 0;
  const first = (rows[0][0] || "").trim().toLowerCase();
  if (first === "question" || first === "questions" || first === "q") {
    start = 1;
  }

  const questions = [];
  const warnings = [];

  for (let r = start; r < rows.length; r++) {
    const cols = rows[r].map((c) => c.trim());
    const lineNo = r + 1;
    const text = cols[0];
    if (!text) {
      warnings.push(`Row ${lineNo}: no question text — skipped.`);
      continue;
    }
    // Answer columns are 1..4 (indexes 1..4).
    const answers = [cols[1], cols[2], cols[3], cols[4]]
      .filter((a) => a !== undefined && a !== "")
      .slice(0, 4);
    if (answers.length < 2) {
      warnings.push(`Row ${lineNo}: needs at least 2 answers — skipped.`);
      continue;
    }

    // "correct" is column index 5. Accept number (1-based) or letter A-D.
    let correctRaw = (cols[5] || "").trim();
    let correctIndex = -1;
    if (/^[0-9]+$/.test(correctRaw)) {
      correctIndex = parseInt(correctRaw, 10) - 1;
    } else if (/^[a-dA-D]$/.test(correctRaw)) {
      correctIndex = correctRaw.toUpperCase().charCodeAt(0) - 65;
    }
    if (correctIndex < 0 || correctIndex >= answers.length) {
      warnings.push(
        `Row ${lineNo}: "correct" must be 1-${answers.length} (or A-${String.fromCharCode(
          64 + answers.length
        )}) — skipped.`
      );
      continue;
    }

    // Optional timeLimit is column index 6.
    let timeLimit = parseInt((cols[6] || "").trim(), 10);
    if (!Number.isFinite(timeLimit) || timeLimit < 5 || timeLimit > 120) {
      timeLimit = 20;
    }

    questions.push({
      text: text.slice(0, 300),
      answers: answers.map((a) => a.slice(0, 120)),
      correctIndex,
      timeLimit,
    });
  }

  if (questions.length === 0) {
    return {
      quiz: null,
      warnings: warnings.length ? warnings : ["No valid questions found."],
    };
  }

  return {
    quiz: { title: fallbackTitle.slice(0, 120), questions },
    warnings,
  };
}

// Turn an array of row-arrays into a CSV string (for downloads).
function toCSV(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? "" : String(cell);
          // Quote if the cell contains comma, quote, or newline.
          if (/[",\n]/.test(s)) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        })
        .join(",")
    )
    .join("\r\n");
}

module.exports = { parseCSV, csvToQuiz, toCSV };
