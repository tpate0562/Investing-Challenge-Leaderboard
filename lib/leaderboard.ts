import { parseCSV } from "./csv";

export type Position = {
  quantity: number;
  openPrice?: number;
  currentPrice?: number;
  unrealizedGain?: number;
};

export type PlayerStats = {
  name: string;
  realizedPL: number;
  unrealizedPL: number;
  totalPL: number;
  returnPct: number; // 0.12 => +12%
  equity: number;    // initial + totalPL
  trades: number;
  lastActivity?: string; // ISO-ish
  details: {
    creditsTotal: number;
    debitsTotal: number;
  };
};

function normalize(s: string) {
  return (s ?? "").trim().toLowerCase();
}

function parseNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  const s = String(raw).trim();
  if (!s) return null;

  // Handle accounting parentheses: ($1,234.56)
  const neg = /^\(.*\)$/.test(s);
  const cleaned = s
    .replace(/[,$]/g, "")
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .replace(/%$/, "")
    .trim();

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function findCellAdjacentToLabel(grid: string[][], label: string): number | null {
  const target = normalize(label);
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (normalize(grid[r][c] ?? "") === target) {
        const right = grid[r]?.[c + 1];
        return parseNumber(right) ?? null;
      }
    }
  }
  return null;
}

function findHeaderRow(grid: string[][], requiredHeaders: string[]): { rowIndex: number; colIndexByHeader: Record<string, number> } | null {
  const required = requiredHeaders.map(normalize);
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r].map((v) => normalize(v ?? ""));
    const colIndexByHeader: Record<string, number> = {};
    for (const header of required) {
      const idx = row.indexOf(header);
      if (idx === -1) {
        // special case: "date & time" typo variants
        if (header.includes("date") && header.includes("time")) {
          const altIdx = row.findIndex((x) => x.includes("date") && x.includes("time"));
          if (altIdx !== -1) colIndexByHeader[header] = altIdx;
          else break;
        } else {
          break;
        }
      } else {
        colIndexByHeader[header] = idx;
      }
    }
    if (Object.keys(colIndexByHeader).length === required.length) {
      return { rowIndex: r, colIndexByHeader };
    }
  }
  return null;
}

function parseOpenPositions(grid: string[][]): { positions: Position[]; unrealizedTotal: number } {
  // Find the row with: Quantity | Open Price | Current Price | Unrealized Gain
  const header = findHeaderRow(grid, ["quantity", "open price", "current price", "unrealized gain"]);
  if (!header) return { positions: [], unrealizedTotal: 0 };

  const start = header.rowIndex + 1;
  const qCol = header.colIndexByHeader["quantity"];
  const oCol = header.colIndexByHeader["open price"];
  const cCol = header.colIndexByHeader["current price"];
  const uCol = header.colIndexByHeader["unrealized gain"];

  const positions: Position[] = [];
  let unrealizedTotal = 0;

  for (let r = start; r < grid.length; r++) {
    const row = grid[r];
    const q = parseNumber(row[qCol]);
    const o = parseNumber(row[oCol]);
    const cp = parseNumber(row[cCol]);
    const u = parseNumber(row[uCol]);

    // Stop if we hit an empty stretch (assumes table is contiguous)
    if (q === null && o === null && cp === null && u === null) {
      // but allow some initial blank rows
      if (r > start + 2) break;
      continue;
    }

    const qty = q ?? 0;
    const unreal = u ?? (qty && o !== null && cp !== null ? qty * (cp - o) : 0);
    positions.push({
      quantity: qty,
      openPrice: o ?? undefined,
      currentPrice: cp ?? undefined,
      unrealizedGain: unreal,
    });
    unrealizedTotal += unreal;
  }

  return { positions, unrealizedTotal };
}

function parseJournalTotals(grid: string[][]): { creditsTotal: number; debitsTotal: number; trades: number; lastActivity?: string } {
  // Find the row with Total $ Received and Total $ Paid somewhere (same row typically).
  const header = findHeaderRow(grid, ["action", "date & time", "total $ received", "status", "action", "date & time", "total $ paid"]);
  // Above expects both credits and debits sections. If not found, fallback to independent search.
  let creditsTotal = 0;
  let debitsTotal = 0;
  let trades = 0;
  let lastActivity: string | undefined;

  if (header) {
    // The header row likely contains two "action" and two "date & time" columns.
    // We'll locate the received/paid columns by name search within that header row.
    const row = grid[header.rowIndex].map((v) => normalize(v ?? ""));
    const receivedCol = row.indexOf("total $ received");
    const paidCol = row.indexOf("total $ paid");

    // For date/time, prefer the rightmost one with "date" and "time" to get last activity.
    const dateCols = row
      .map((v, idx) => ({ v, idx }))
      .filter(({ v }) => v.includes("date") && v.includes("time"))
      .map(({ idx }) => idx);

    const dateCol = dateCols.length ? Math.max(...dateCols) : -1;

    const start = header.rowIndex + 1;
    for (let r = start; r < grid.length; r++) {
      const rr = grid[r];
      const rec = receivedCol >= 0 ? parseNumber(rr[receivedCol]) : null;
      const paid = paidCol >= 0 ? parseNumber(rr[paidCol]) : null;

      // Count any row with action in either section as an "activity"
      const anyAction = rr.some((cell) => normalize(cell ?? "") !== "" && normalize(cell ?? "") !== "0");
      if (anyAction && (rec !== null || paid !== null)) trades++;

      if (rec !== null) creditsTotal += rec;
      if (paid !== null) debitsTotal += paid;

      // last activity (best-effort)
      if (dateCol >= 0) {
        const dt = (rr[dateCol] ?? "").trim();
        if (dt) lastActivity = dt;
      }

      // Stop after a long empty streak below the journal (prevents scanning thousands of rows)
      if ((rec === null && paid === null) && r > start + 20) {
        // If we've already accumulated something and we're now seeing lots of empties, stop.
        const tail = grid.slice(r, r + 10);
        if (tail.every((x) => x.every((y) => (y ?? "").trim() === ""))) break;
      }
    }
    return { creditsTotal, debitsTotal, trades, lastActivity };
  }

  // Fallback: brute-force sum any column whose header matches.
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r].map((v) => normalize(v ?? ""));
    const receivedCol = row.indexOf("total $ received");
    const paidCol = row.indexOf("total $ paid");
    if (receivedCol !== -1 || paidCol !== -1) {
      const start = r + 1;
      for (let i = start; i < grid.length; i++) {
        const rr = grid[i];
        if (receivedCol !== -1) {
          const n = parseNumber(rr[receivedCol]);
          if (n !== null) creditsTotal += n;
        }
        if (paidCol !== -1) {
          const n = parseNumber(rr[paidCol]);
          if (n !== null) debitsTotal += n;
        }
        if ((rr[receivedCol] ?? rr[paidCol] ?? "").trim()) trades++;
      }
      break;
    }
  }

  return { creditsTotal, debitsTotal, trades, lastActivity };
}

export function computePlayerStatsFromSheetCSV(args: {
  name: string;
  csvText: string;
  initialCapital: number;
}): PlayerStats {
  const grid = parseCSV(args.csvText);

  // 1) Realized P/L cell if they’re manually tracking it
  const realizedFromLabel = findCellAdjacentToLabel(grid, "Realized P/L:");
  const { positions, unrealizedTotal } = parseOpenPositions(grid);
  const journal = parseJournalTotals(grid);

  // If realized isn't present, approximate realized P/L from journal totals.
  const realizedPL =
    realizedFromLabel !== null ? realizedFromLabel : (journal.creditsTotal - journal.debitsTotal);

  const unrealizedPL = unrealizedTotal;
  const totalPL = realizedPL + unrealizedPL;

  const initial = Number.isFinite(args.initialCapital) && args.initialCapital > 0 ? args.initialCapital : 10000;
  const returnPct = totalPL / initial;
  const equity = initial + totalPL;

  return {
    name: args.name,
    realizedPL,
    unrealizedPL,
    totalPL,
    returnPct,
    equity,
    trades: journal.trades,
    lastActivity: journal.lastActivity,
    details: { creditsTotal: journal.creditsTotal, debitsTotal: journal.debitsTotal },
  };
}
