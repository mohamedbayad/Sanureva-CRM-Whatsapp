import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/n8n";
import { computeMetrics } from "@/lib/metrics";
import { SHEET_NAMES } from "@/lib/contracts";
import { cleanDisplay } from "@/lib/format";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

// This endpoint is session-protected by proxy.ts. It exercises the *same getSnapshot*
// implementation that Dashboard, Inbox and Orders use. No PII or message bodies returned.
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.CRM_READ_SOURCE !== "neon_shadow" ||
      process.env.CRM_PREVIEW_DIRECT_READ !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }
  try {
    const snapshot = await getSnapshot();
    if (snapshot.source !== "neon") throw new Error("CRM is not serving Neon");
    const orders = snapshot.sheets[SHEET_NAMES.orders];
    const messages = snapshot.sheets[SHEET_NAMES.messages];
    const conversations = snapshot.sheets[SHEET_NAMES.conversations];
    const knownConversations = new Set(conversations.map(c => cleanDisplay(c["Conversation ID"])));
    const unlinked = messages.filter(m => !knownConversations.has(cleanDisplay(m["Conversation ID"]))).length;
    const orderIds = orders.map(o => cleanDisplay(o["Order ID"]));
    const duplicateOrderIds = orderIds.length - new Set(orderIds).size;
    const statusOnly = messages.filter(m =>
      !cleanDisplay(m["Message ID"]) && !cleanDisplay(m["Conversation ID"]) &&
      !cleanDisplay(m["Customer Phone"]) &&
      ["read", "delivered", "failed", "sent"].includes(cleanDisplay(m["Delivery Status"]).toLowerCase())
    ).length;
    const metrics = computeMetrics(snapshot);
    const ok = snapshot.contractOk &&
      orders.length > 0 && conversations.length > 0 && messages.length > 0 &&
      duplicateOrderIds === 0 && unlinked === 0 && statusOnly === 0 &&
      Number.isFinite(metrics.grossRevenue) && Number.isFinite(metrics.avgOrder) &&
      Number.isFinite(metrics.confirmationRate);

    return NextResponse.json({
      ok,
      mode: "neon_preview_readonly",
      source: snapshot.source,
      writes_enabled: false,
      browser_pages_manually_verified: false,
      original_media_retrieval_tested: false,
      data_may_lag_sheets_minutes: 15,
      counts: { orders: orders.length, conversations: conversations.length, messages: messages.length },
      checks: {
        dashboard: Number.isFinite(metrics.grossRevenue) && Number.isFinite(metrics.avgOrder),
        orders: duplicateOrderIds === 0 && orders.length > 0,
        inbox: messages.length > 0 && conversations.length > 0 && unlinked === 0 && statusOnly === 0,
        contract_ok: snapshot.contractOk,
        contract_warnings: snapshot.contractWarnings.length,
        unlinked_messages: unlinked,
        duplicate_order_ids: duplicateOrderIds,
        leaked_delivery_status_only_rows: statusOnly,
      },
    }, { status: ok ? 200 : 409, headers });
  } catch {
    return NextResponse.json({ ok: false, error: "neon_preview_page_qa_failed" }, { status: 503, headers });
  }
}
