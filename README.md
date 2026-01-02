# Investing Challenge Leaderboard (Vercel-ready)

A small Next.js app that reads your **public** Google Sheet (one tab per participant) and generates a live leaderboard.

## What it expects in each participant tab

This matches your template:

- A cell containing the label **`Realized P/L:`** (the app uses the value in the cell immediately to the right if present).
- An **Open Positions** table with headers:
  - `Quantity`, `Open Price`, `Current Price`, `Unrealized Gain`
- A **General Journal** section with headers including:
  - `Total $ Received` and `Total $ Paid`

If `Realized P/L:` is blank, the app approximates realized P/L as:
`sum(Total $ Received) - sum(Total $ Paid)`.

Return% is computed as `(realized + unrealized) / INITIAL_CAPITAL`.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Deploy to Vercel

1. Push this folder to GitHub (or upload directly to Vercel).
2. In Vercel, set env vars (Project → Settings → Environment Variables):
   - `SHEET_ID`
   - `SHEET_TABS`
   - `INITIAL_CAPITAL`
   - (optional) `GOOGLE_SHEETS_API_KEY` if the sheet is not public
3. Deploy.

## Notes

- For easiest use, share the Sheet as **“Anyone with the link can view”**.
- The server caches Google fetches for ~60 seconds to avoid hammering Sheets.
