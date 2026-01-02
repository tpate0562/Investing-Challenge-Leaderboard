import { NextResponse } from "next/server";
import { CONFIG } from "@/lib/config";
import { computePlayerStatsFromSheetCSV, PlayerStats } from "@/lib/leaderboard";

function sheetCsvUrl(sheetId: string, sheetName: string) {
  // No-auth approach for public sheets: Google Visualization "gviz" endpoint.
  // Example pattern documented widely:
  //   https://docs.google.com/spreadsheets/d/{key}/gviz/tq?tqx=out:csv&sheet={sheet_name}
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq`;
  const params = new URLSearchParams({ tqx: "out:csv", sheet: sheetName });
  return `${base}?${params.toString()}`;
}

async function fetchSheetAsCsvViaGviz(sheetId: string, sheetName: string): Promise<string> {
  const url = sheetCsvUrl(sheetId, sheetName);
  const res = await fetch(url, {
    // Server-side fetch: allow caching for a minute to avoid hammering Google
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`GViz fetch failed for "${sheetName}": ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

async function fetchSheetAsCsvViaSheetsApi(sheetId: string, sheetName: string, apiKey: string): Promise<string> {
  // Sheets API returns JSON values; we convert to CSV-ish text for the same downstream parser.
  const range = `${sheetName}!A1:AB2000`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?key=${encodeURIComponent(apiKey)}&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(`Sheets API fetch failed for "${sheetName}": ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const values = data.values ?? [];
  // Convert to CSV
  const lines = values.map((row) =>
    row
      .map((cell) => {
        const s = String(cell ?? "");
        if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`;
        return s;
      })
      .join(",")
  );
  return lines.join("\n");
}

export async function GET() {
  const started = Date.now();

  const initial = CONFIG.initialCapital;
  const sheetId = CONFIG.sheetId;
  const tabs = CONFIG.tabs;

  const results: { ok: true; data: PlayerStats[]; meta: any } | { ok: false; error: string; meta: any } = await (async () => {
    try {
      const players = await Promise.all(
        tabs.map(async (name) => {
          let csvText: string;
          try {
            csvText = await fetchSheetAsCsvViaGviz(sheetId, name);
          } catch (e) {
            if (!CONFIG.googleSheetsApiKey) throw e;
            csvText = await fetchSheetAsCsvViaSheetsApi(sheetId, name, CONFIG.googleSheetsApiKey);
          }
          return computePlayerStatsFromSheetCSV({ name, csvText, initialCapital: initial });
        })
      );

      // Rank: highest return first
      players.sort((a, b) => b.returnPct - a.returnPct);

      return {
        ok: true,
        data: players,
        meta: {
          sheetId,
          tabs,
          initialCapital: initial,
          fetchedAt: new Date().toISOString(),
          ms: Date.now() - started,
        },
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message ?? "Unknown error",
        meta: {
          sheetId,
          tabs,
          initialCapital: initial,
          fetchedAt: new Date().toISOString(),
          ms: Date.now() - started,
        },
      };
    }
  })();

  return NextResponse.json(results, { status: results.ok ? 200 : 500 });
}
