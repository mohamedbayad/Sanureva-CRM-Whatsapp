import { google } from "googleapis";
import fixture from "@/data/snapshot.json";
import { REQUIRED_HEADERS, SHEET_NAMES, type SheetName } from "@/lib/contracts";
import type { CrmSnapshot, OutboxPayload, SheetRecord } from "@/lib/types";
import { cleanDisplay, normalizePhone } from "@/lib/format";

const DEFAULT_SPREADSHEET_ID = "1PKoTiaW-QAuz3D2PydyG4KQqCM_xl9qfFqXNaMXNias";
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
const READ_SHEETS = Object.values(SHEET_NAMES) as SheetName[];

function liveConfigured() {
  return Boolean(process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY);
}

function auth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function valuesToRecords(values: unknown[][] | undefined): SheetRecord[] {
  if (!values?.length) return [];
  const headers = (values[0] || []).map((v) => String(v ?? "").trim());
  return values.slice(1).filter((row) => row.some((v) => v !== null && v !== undefined && String(v).trim() !== ""))
    .map((row) => Object.fromEntries(headers.map((h, i) => [h, (row as unknown[])[i] ?? null])) as SheetRecord);
}

function fixtureRecords(name: SheetName): SheetRecord[] {
  const rows = (fixture as Record<string, unknown[][]>)[name] || [];
  return valuesToRecords(rows);
}

function contractWarnings(sheets: Record<SheetName, SheetRecord[]>): string[] {
  const warnings: string[] = [];
  for (const sheet of READ_SHEETS) {
    const rows = sheets[sheet];
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const missing = REQUIRED_HEADERS[sheet].filter((h) => !headers.includes(h));
    if (missing.length) warnings.push(`${sheet}: missing ${missing.join(", ")}`);
  }
  return warnings;
}

export async function getSnapshot(): Promise<CrmSnapshot> {
  let sheets = {} as Record<SheetName, SheetRecord[]>;
  let source: CrmSnapshot["source"] = "fixture";

  if (liveConfigured()) {
    const api = google.sheets({ version: "v4", auth: auth() });
    const result = await api.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID,
      ranges: READ_SHEETS.map((s) => `'${s}'!A:Z`),
      majorDimension: "ROWS",
      valueRenderOption: "FORMATTED_VALUE",
    });
    READ_SHEETS.forEach((name, i) => {
      sheets[name] = valuesToRecords((result.data.valueRanges?.[i]?.values || []) as unknown[][]);
    });
    source = "google-sheets";
  } else {
    for (const name of READ_SHEETS) sheets[name] = fixtureRecords(name);
  }

  const warnings = contractWarnings(sheets);
  return {
    source,
    spreadsheetId: SPREADSHEET_ID,
    syncedAt: new Date().toISOString(),
    contractOk: warnings.length === 0,
    contractWarnings: warnings,
    sheets,
  };
}

function generateRequestId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `WA-WEB-${stamp}-${rand}`;
}

export async function appendOutbox(payload: OutboxPayload) {
  if (!liveConfigured()) {
    throw new Error("Live Google Sheets credentials are not configured. Add the .env.local values first.");
  }

  const phone = normalizePhone(payload.phone);
  if (!phone) throw new Error("Phone is required.");
  if (!payload.type) throw new Error("Message type is required.");
  if (payload.type !== "Text" && !cleanDisplay(payload.mediaUrl)) {
    throw new Error(`${payload.type} requires a public Media URL.`);
  }
  if (!cleanDisplay(payload.message) && payload.type === "Text") {
    throw new Error("Text message cannot be empty.");
  }

  const api = google.sheets({ version: "v4", auth: auth() });
  const requestId = generateRequestId();
  const row = [
    requestId,
    "SEND",
    phone,
    cleanDisplay(payload.customer),
    cleanDisplay(payload.orderId),
    payload.type,
    cleanDisplay(payload.message),
    cleanDisplay(payload.mediaUrl),
    cleanDisplay(payload.fileName),
    "",
    "",
    "",
    "",
  ];

  await api.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAMES.outbox}'!A:M`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  return { requestId, action: "SEND", phone };
}
