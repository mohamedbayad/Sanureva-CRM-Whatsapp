import type { CrmSnapshot, OutboxPayload, SheetRecord } from "@/lib/types";
import { REQUIRED_HEADERS, SHEET_NAMES, type SheetName } from "@/lib/contracts";
import { cleanDisplay, normalizePhone } from "@/lib/format";
import { createHmac } from "node:crypto";

const N8N_CRM_WEBHOOK_URL = (process.env.N8N_CRM_WEBHOOK_URL || "").trim();
const N8N_CRM_API_KEY = (process.env.N8N_CRM_API_KEY || "").trim();

function configured() {
  return Boolean(N8N_CRM_WEBHOOK_URL);
}

function friendlyHttpError(status: number, raw: unknown) {
  if (status === 404) {
    return "n8n CRM Gateway not found (404). Import/publish 'Sanureva — CRM API Gateway' and verify N8N_CRM_WEBHOOK_URL.";
  }
  if (status === 401 || status === 403) {
    return "n8n CRM Gateway rejected the request. Verify N8N_CRM_API_KEY matches the gateway token.";
  }
  if (raw && typeof raw === "object" && "error" in raw) {
    return String((raw as { error?: unknown }).error || `n8n request failed (${status})`);
  }
  return `n8n request failed (${status})`;
}

async function callN8n<T>(body: Record<string, unknown>): Promise<T> {
  if (!configured()) {
    throw new Error("N8N_CRM_WEBHOOK_URL is not configured in .env.local.");
  }

  let response: Response;
  try {
    response = await fetch(N8N_CRM_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(N8N_CRM_API_KEY ? { "X-CRM-Key": N8N_CRM_API_KEY } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    throw new Error(`Cannot reach n8n CRM Gateway: ${error instanceof Error ? error.message : "network error"}`);
  }

  const text = await response.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`n8n returned a non-JSON response (${response.status}).`);
    }
  }

  if (!response.ok) {
    throw new Error(friendlyHttpError(response.status, json));
  }

  if (!text) {
    throw new Error("n8n returned an empty response. Verify the CRM Gateway is active and the API key matches.");
  }

  return json as T;
}

function toSheetMap(raw: Record<string, unknown>): Record<SheetName, SheetRecord[]> {
  const arrays: Record<string, unknown> = {
    [SHEET_NAMES.orders]: raw.orders,
    [SHEET_NAMES.conversations]: raw.conversations,
    [SHEET_NAMES.messages]: raw.messages,
    [SHEET_NAMES.events]: raw.confirmationEvents,
    [SHEET_NAMES.workflowHealth]: raw.workflowHealth,
    [SHEET_NAMES.outbox]: raw.outbox,
  };

  return Object.fromEntries(
    Object.values(SHEET_NAMES).map((name) => [
      name,
      Array.isArray(arrays[name]) ? (arrays[name] as SheetRecord[]) : [],
    ])
  ) as Record<SheetName, SheetRecord[]>;
}

export async function getSnapshot(): Promise<CrmSnapshot> {
  const raw = await (async (): Promise<Record<string, unknown>> => {
    if (process.env.CRM_READ_SOURCE !== "neon") {
      return callN8n<Record<string, unknown>>({ action: "snapshot" });
    }
    try {
      const { getNeonRawSnapshot } = await import("@/lib/neon-snapshot");
      return await getNeonRawSnapshot();
    } catch (error) {
      console.error("Neon snapshot unavailable; using n8n fallback:", error instanceof Error ? error.message : "unknown error");
      return callN8n<Record<string, unknown>>({ action: "snapshot" });
    }
  })();
  if (raw.ok === false) {
    throw new Error(String(raw.error || "n8n CRM Gateway returned an error."));
  }
  if (raw.source !== "n8n" && !raw.sheets && !Array.isArray(raw.orders)) {
    throw new Error("Unexpected response from n8n CRM Gateway. Verify the imported gateway workflow version.");
  }

  const sheets = raw.sheets && typeof raw.sheets === "object"
    ? (raw.sheets as Record<SheetName, SheetRecord[]>)
    : toSheetMap(raw);

  // Repair one historical bot reply that was successfully sent/read on WhatsApp
  // before the workflow logging order was fixed. This is display-only and does
  // not resend anything to the customer.
  const repairedWamid = "wamid.HBgLNTAyNTkyNzcyNDMVAgARGBI3NDIzMEU5QTIwQjMwMDg4NDIA";
  const repairedMessage: SheetRecord = {
    "Message ID": "MSG-1791405095414",
    "Conversation ID": "WA-50259277243",
    "Order ID": "",
    "Timestamp": "2026-10-07T22:31:35.414+02:00",
    "Direction": "Outbound (Bot)",
    "Message Type": "Text Message",
    "Message Content Snippet": "¡No es ninguna molestia! 😊\n\nSi gustas, podemos dejar tu pedido solicitado desde ahora para que ya quede programado y no se te olvide.\n\n¿Te parece bien? Si es así, solo necesito tu nombre completo, departamento, ciudad y dirección de entrega.",
    "Delivery Status": "read",
    "WhatsApp WAMID": repairedWamid,
    "Unit Cost (MAD)": "0",
    "Customer Phone": "50259277243",
    "Customer Name": "nena",
  };
  const messages = sheets[SHEET_NAMES.messages] || [];
  const existingIndex = messages.findIndex((m) => cleanDisplay(m["WhatsApp WAMID"]) === repairedWamid);
  if (existingIndex >= 0) {
    messages[existingIndex] = { ...messages[existingIndex], ...repairedMessage };
  } else {
    messages.push(repairedMessage);
  }

  // Keep AI analysis private in n8n; the CRM receives original WhatsApp media
  // identifiers and short-lived signed URLs instead of vision/transcript text.
  const expiry = Math.ceil((Date.now() / 1000 + 600) / 300) * 300;
  const mediaMarker = /\[\[WA_MEDIA:(image|audio|video|document):(\d{8,30})\]\]/;
  for (const row of messages) {
    const raw = cleanDisplay(row["Message Content Snippet"]);
    const marker = mediaMarker.exec(raw);
    const kind = cleanDisplay(row["Media Kind"]) || marker?.[1] || "";
    const id = cleanDisplay(row["Media ID"]) || marker?.[2] || "";
    if (!["image", "audio", "video", "document"].includes(kind) || !/^\d{8,30}$/.test(id)) continue;
    const safeCaption = raw
      .replace(mediaMarker, "")
      .replace(/\n?\[CONTEXTO DEL ANUNCIO DE ORIGEN: [\s\S]*?\]/g, "")
      .trim();
    const defaults: Record<string,string> = {
      image: "📷 Imagen recibida", audio: "🎤 Nota de voz",
      video: "🎬 Video recibido", document: "📄 Documento recibido"
    };
    const sig = N8N_CRM_API_KEY
      ? createHmac("sha256", N8N_CRM_API_KEY).update(kind + ":" + id + ":" + expiry).digest("hex")
      : "";
    row["Media Kind"] = kind;
    row["Media ID"] = id;
    row["Media URL"] = sig
      ? "/api/media?id=" + encodeURIComponent(id) + "&kind=" + kind + "&exp=" + expiry + "&sig=" + sig
      : "";
    row["Message Content Snippet"] = safeCaption || defaults[kind];
  }

  sheets[SHEET_NAMES.messages] = messages;

  const localWarnings: string[] = [];
  for (const [sheetName, required] of Object.entries(REQUIRED_HEADERS) as [SheetName, readonly string[]][]) {
    const rows = sheets[sheetName] || [];
    if (!rows.length) continue;
    const keys = new Set(rows.flatMap((row) => Object.keys(row)));
    const missing = required.filter((header) => !keys.has(header));
    if (missing.length) localWarnings.push(`${sheetName}: missing ${missing.join(", ")}`);
  }

  const remoteWarnings = Array.isArray(raw.contractWarnings) ? raw.contractWarnings.map(String) : [];
  const contractWarnings = [...remoteWarnings, ...localWarnings];
  const remoteOk = raw.contractOk === undefined ? true : Boolean(raw.contractOk);

  return {
    source: "n8n",
    syncedAt: String(raw.generatedAt || raw.syncedAt || new Date().toISOString()),
    contractOk: remoteOk && contractWarnings.length === 0,
    contractWarnings,
    sheets,
  };
}

export async function queueWhatsAppMessage(payload: OutboxPayload) {
  const phone = normalizePhone(payload.phone);
  if (!phone) throw new Error("Phone is required.");
  if (!payload.type) throw new Error("Message type is required.");
  if (payload.type !== "Text" && !cleanDisplay(payload.mediaUrl)) {
    throw new Error(`${payload.type} requires a public Media URL.`);
  }
  if (payload.type === "Text" && !cleanDisplay(payload.message)) {
    throw new Error("Text message cannot be empty.");
  }

  const result = await callN8n<Record<string, unknown>>({
    action: "send_message",
    phone,
    customer_name: cleanDisplay(payload.customer),
    order_id: cleanDisplay(payload.orderId),
    type: payload.type.toLowerCase(),
    message: cleanDisplay(payload.message),
    media_url: cleanDisplay(payload.mediaUrl),
    file_name: cleanDisplay(payload.fileName),
  });

  if (result.ok === false) {
    throw new Error(String(result.error || "n8n could not queue the WhatsApp message."));
  }

  return result;
}

export function getN8nGatewayConfig() {
  return { configured: configured(), url: N8N_CRM_WEBHOOK_URL, hasApiKey: Boolean(N8N_CRM_API_KEY) };
}
