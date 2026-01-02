export const CONFIG = {
  sheetId: process.env.SHEET_ID ?? "1ELgEQlYXM3oE66pIbziJVFCEPPGJ5EX9HS6Dv5B1jEw",
  tabs: (process.env.SHEET_TABS ?? "Tejas,Miguel,William,Lucas,Gabe,Person 1,Person 2")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  initialCapital: Number(process.env.INITIAL_CAPITAL ?? "10000"),
  googleSheetsApiKey: process.env.GOOGLE_SHEETS_API_KEY,
};
