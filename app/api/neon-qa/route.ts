import { NextResponse } from "next/server";
import { getNeonRawSnapshot } from "@/lib/neon-snapshot";
import { computeMetrics, latestRows } from "@/lib/metrics";
import { SHEET_NAMES, REQUIRED_HEADERS, type SheetName } from "@/lib/contracts";
import type { CrmSnapshot, SheetRecord } from "@/lib/types";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

// This endpoint tests the same data contract/metrics consumed by the UI.
// It never returns customer records, order details, message bodies or credentials.
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.CRM_READ_SOURCE !== "neon_shadow") {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }
  try {
    const data = await getNeonRawSnapshot();
    const mapping = {
      ORDERS: "orders",
      CONVERSATIONS: "conversations",
      MESSAGES: "messages",
      CONFIRMATION_EVENTS: "confirmationEvents",
      WORKFLOW_HEALTH: "workflowHealth",
      WHATSAPP_OUTBOX: "outbox",
    } as const;
    const sheets = {} as Record<SheetName, SheetRecord[]>;
    const contractWarnings: string[] = [];
    for (const [sheet, property] of Object.entries(mapping) as [SheetName, keyof typeof data][]) {
      const records = data[property];
      if (!Array.isArray(records)) throw new Error("Incomplete CRM snapshot structure");
      sheets[sheet] = records as SheetRecord[];
      const keys = new Set(records.flatMap((row) => Object.keys(row)));
      if (records.length) {
        const missingColumns = REQUIRED_HEADERS[sheet].filter((name) => !keys.has(name));
        if (missingColumns.length) contractWarnings.push(`${sheet}: missing expected source columns`);
      }
    }
    const snapshot: CrmSnapshot = {
      source: "n8n", syncedAt: new Date().toISOString(),
      contractOk: contractWarnings.length === 0, contractWarnings, sheets,
    };
    const dashboard = computeMetrics(snapshot);
    const latestOrders = latestRows(sheets[SHEET_NAMES.orders], "Date & Time", 6);
    const conversations = sheets[SHEET_NAMES.conversations];
    const messages = sheets[SHEET_NAMES.messages];
    const orderRows = sheets[SHEET_NAMES.orders];
    const uniqueOrders = new Set(orderRows.map((r) => String(r["Order ID"] || "")).filter(Boolean));
    const conversationKeys = new Set(conversations.map((r) => String(r["Conversation ID"] || "")).filter(Boolean));
    const linkedMessages = messages.filter((r) => conversationKeys.has(String(r["Conversation ID"] || ""))).length;
    const unlinkedMessages = messages.length - linkedMessages;
    const missingMessageIds = messages.filter((r) => !String(r["Message ID"] || "").trim()).length;
    const inboxDataReady = conversations.length > 0 && messages.length > 0 && unlinkedMessages === 0;
    const validOrders = uniqueOrders.size === orderRows.length && orderRows.length > 0;
    const dashboardReady = Number.isFinite(dashboard.orders) && Number.isFinite(dashboard.messages)
      && Number.isFinite(dashboard.confirmationRate) && Number.isFinite(dashboard.avgOrder);
    return NextResponse.json({
      ok: dashboardReady && validOrders && inboxDataReady && contractWarnings.length === 0,
      mode: "neon_shadow", scope: "preview_only", write_access: false,
      checks: {
        dashboard: { ready: dashboardReady, orders: dashboard.orders,
          conversations: dashboard.conversations, messages: dashboard.messages },
        inbox: { data_ready: inboxDataReady,
          conversations: conversations.length, messages: messages.length,
          linked_messages: linkedMessages, unlinked_messages: unlinkedMessages,
          legacy_messages_without_id: missingMessageIds,
          original_media_retrieval_tested: false, status_records_excluded_from_inbox: true },
        orders: { data_ready: validOrders, rows: orderRows.length,
          unique_order_ids: uniqueOrders.size, latest_order_list_renderable: latestOrders.length },
        contract: { valid: contractWarnings.length === 0, warning_count: contractWarnings.length },
      },
      note: "Status-only delivery callbacks are excluded from Neon Inbox totals but remain stored. No browser/media test.",
    }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "neon_preview_qa_unavailable" },
      { status: 503, headers });
  }
}
