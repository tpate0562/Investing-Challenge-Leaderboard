"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";

type PlayerStats = {
  name: string;
  realizedPL: number;
  unrealizedPL: number;
  totalPL: number;
  returnPct: number;
  equity: number;
  trades: number;
  lastActivity?: string;
  details: { creditsTotal: number; debitsTotal: number };
};

type ApiResp =
  | { ok: true; data: PlayerStats[]; meta: { fetchedAt: string; ms: number; initialCapital: number } }
  | { ok: false; error: string; meta: { fetchedAt: string; ms: number; initialCapital: number } };

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<ApiResp>);

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function fmtPct(p: number) {
  return (p * 100).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) + "%";
}

type SortKey = "returnPct" | "totalPL" | "equity" | "realizedPL" | "unrealizedPL" | "trades" | "name";
type SortDir = "asc" | "desc";

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<ApiResp>("/api/leaderboard", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("returnPct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    if (!data || !data.ok) return [];
    const q = query.trim().toLowerCase();

    const filtered = data.data.filter((p) => !q || p.name.toLowerCase().includes(q));
    const sorted = [...filtered].sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      const av = a[sortKey] as unknown as number;
      const bv = b[sortKey] as unknown as number;
      return (av - bv) * dir;
    });

    return sorted;
  }, [data, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const meta = data && data.ok ? data.meta : data && !data.ok ? data.meta : null;

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="h1">2026 Investing Challenge Leaderboard</h1>
          <div className="sub">
            Powered by your Google Sheet • refreshes every ~60s
            {meta ? ` • initial capital: ${fmtMoney(meta.initialCapital)}` : ""}
          </div>
        </div>

        <div className="controls">
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name…"
            aria-label="Search"
          />
          <button className="button" onClick={() => mutate()} aria-label="Refresh now">
            Refresh
          </button>
          {meta ? <span className="badge">Last fetch: {new Date(meta.fetchedAt).toLocaleString()}</span> : null}
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="sub">Loading…</div> : null}
        {error ? <div className="sub">Network error: {String(error)}</div> : null}
        {data && !data.ok ? (
          <div className="sub">
            <div style={{ marginBottom: 8 }}>API error: {data.error}</div>
            <div>Tip: make sure the Google Sheet is viewable by “Anyone with the link”, or set GOOGLE_SHEETS_API_KEY.</div>
          </div>
        ) : null}

        {data && data.ok ? (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th onClick={() => toggleSort("name")}>Name</th>
                  <th onClick={() => toggleSort("returnPct")}>Return</th>
                  <th onClick={() => toggleSort("totalPL")}>P/L</th>
                  <th onClick={() => toggleSort("equity")}>Equity</th>
                  <th onClick={() => toggleSort("realizedPL")}>Realized</th>
                  <th onClick={() => toggleSort("unrealizedPL")}>Unrealized</th>
                  <th onClick={() => toggleSort("trades")}>Trades</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, idx) => {
                  const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "";
                  const cls = p.returnPct >= 0 ? "pos" : "neg";
                  return (
                    <tr key={p.name}>
                      <td>{idx + 1}</td>
                      <td>
                        <span style={{ marginRight: 6 }}>{medal}</span>
                        {p.name}
                      </td>
                      <td className={cls}>{fmtPct(p.returnPct)}</td>
                      <td className={p.totalPL >= 0 ? "pos" : "neg"}>{fmtMoney(p.totalPL)}</td>
                      <td>{fmtMoney(p.equity)}</td>
                      <td className={p.realizedPL >= 0 ? "pos" : "neg"}>{fmtMoney(p.realizedPL)}</td>
                      <td className={p.unrealizedPL >= 0 ? "pos" : "neg"}>{fmtMoney(p.unrealizedPL)}</td>
                      <td>{p.trades}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="footer">
              <div className="row">
                <span className="badge">
                  Sorting: <b style={{ color: "var(--text)", fontWeight: 600 }}>{sortKey}</b> ({sortDir})
                </span>
                <span className="badge">
                  Tip: click column headers to sort
                </span>
              </div>

              <div className="rules">
                <b style={{ color: "var(--text)" }}>Rules (as provided):</b>
                <ul>
                  <li>Only US Stocks and Futures traded on NASDAQ, NYSE, ARCA, BATS, CME, NYMEX, COMEX during market and extended hours</li>
                  <li>Buy price = closing trade for the minute the trade is placed (high-frequency data)</li>
                  <li>Sell price = closing trade for the minute the trade is placed (high-frequency data)</li>
                  <li>Crypto allowed; Binance minute close is used</li>
                  <li>Betting markets (Polymarket) allowed</li>
                  <li>No equities/futures options</li>
                  <li>No limit/stop/stop-limit/OTO/OTOCO orders</li>
                  <li>Fractional shares allowed (you can enter dollar amount)</li>
                  <li>Short selling allowed; active trading allowed</li>
                </ul>
                <div className="sub">
                  This site just reads your sheet and ranks returns. The sheet itself should implement whatever pricing/validation rules you’re enforcing.
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
