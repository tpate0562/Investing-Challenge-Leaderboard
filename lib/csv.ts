/**
 * Tiny CSV parser that handles:
 * - commas
 * - quoted fields with embedded commas
 * - CRLF/LF newlines
 *
 * Good enough for Google Sheets exports.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (ch === "\n" || ch === "\r") {
      // Handle CRLF
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    cur += ch;
  }

  // last cell
  row.push(cur);
  rows.push(row);

  // trim trailing completely-empty rows
  while (rows.length && rows[rows.length - 1].every((v) => (v ?? "").trim() === "")) {
    rows.pop();
  }
  return rows;
}
