import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/n8n";
import { computeMetrics } from "@/lib/metrics";
import { SHEET_NAMES } from "@/lib/contracts";
import { cleanDisplay } from "@/lib/format";
import { isStatusOnlyRecord } from "@/lib/status-records";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

// Safely exercise the same live snapshot reader as Dashboard, Inbox and Orders.
// Return aggregate diagnostics only; never expose original messages or contacts.
async function verifyPageDataPath() {
  if (process.env.CRM_PREVIEW_DIRECT_READ !== "1") {
    return { ok: false, reason: "direct_preview_read_disabled" };
  }
  try {
    const snapshot = await getSnapshot();
    const conversations = snapshot.sheets[SHEET_NAMES.conversations] || [];
    const messages = snapshot.sheets[SHEET_NAMES.messages] || [];
    const orders = snapshot.sheets[SHEET_NAMES.orders] || [];
    const ids = new Set(conversations.map((c) => cleanDisplay(c["Conversation ID"])).filter(Boolean));
    const unlinked = messages.filter((m) => !ids.has(cleanDisplay(m["Conversation ID"]))).length;
    const validOrderIds = orders.map((o) => cleanDisplay(o["Order ID"])).filter(Boolean);
    const duplicates = validOrderIds.length - new Set(validOrderIds).size;
    const callbacksInInbox = messages.filter(isStatusOnlyRecord).length;
    const media = messages.filter((m) =>
      ["image", "audio", "video", "document"].includes(cleanDisplay(m["Media Kind"]).toLowerCase())
    );
    const images = media.filter((m) => cleanDisplay(m["Media Kind"]).toLowerCase() === "image").length;
    const audios = media.filter((m) => cleanDisplay(m["Media Kind"]).toLowerCase() === "audio").length;
    const mediaWithUrls = media.filter((m) => Boolean(cleanDisplay(m["Media URL"]))).length;
    const metrics = computeMetrics(snapshot);
    const dashboard = Number.isFinite(metrics.grossRevenue) &&
      Number.isFinite(metrics.avgOrder) && Number.isFinite(metrics.confirmationRate);
    const inbox = messages.length > 0 && conversations.length > 0 && unlinked === 0 && callbacksInInbox === 0;
    const ordersOk = orders.length > 0 && validOrderIds.length === orders.length && duplicates === 0;
    return {
      ok: snapshot.source === "neon" && snapshot.contractOk && dashboard && inbox && ordersOk,
      source: snapshot.source,
      readonly: true,
      snapshot_contract_ok: snapshot.contractOk,
      snapshot_contract_warning_count: snapshot.contractWarnings.length,
      checks: { dashboard, inbox, orders: ordersOk },
      counts: {
        conversations: conversations.length, messages: messages.length, orders: orders.length,
        unlinked_messages: unlinked, duplicate_order_ids: duplicates,
        status_callbacks_in_inbox: callbacksInInbox,
      },
      media: {
        images, audios, total: media.length, url_ready: mediaWithUrls,
        original_playback_verified: false,
      },
    };
  } catch {
    return { ok: false, reason: "preview_snapshot_unavailable" };
  }
}

// Aggregate-only data-quality checks. No customer data or message bodies leave this endpoint.
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.CRM_READ_SOURCE !== "neon_shadow") {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503, headers });
  }
  try {
    const sql = neon(process.env.DATABASE_URL);
    const [stats] = await sql`
      WITH flagged AS (
        SELECT m.*,
          (
            (conversation_id IS NULL OR btrim(conversation_id) = '')
            AND (customer_phone IS NULL OR lower(btrim(customer_phone)) = 'unknown' OR btrim(customer_phone) = '')
            AND nullif(btrim(coalesce(message_text, '')), '') IS NULL
            AND nullif(btrim(coalesce(caption, '')), '') IS NULL
            AND nullif(btrim(coalesce(source_record->>'Message Content Snippet', '')), '') IS NULL
            AND nullif(btrim(coalesce(source_record->>'Message Type', '')), '') IS NULL
            AND nullif(btrim(coalesce(source_record->>'Direction', '')), '') IS NULL
            AND nullif(btrim(coalesce(source_record->>'Message ID', '')), '') IS NULL
            AND nullif(btrim(coalesce(whatsapp_wamid, '')), '') IS NOT NULL
            AND lower(btrim(coalesce(delivery_status, ''))) IN ('sent', 'delivered', 'read', 'failed')
          ) AS is_status_only
        FROM public.messages m
      )
      SELECT
        count(*)::int AS total_messages,
        count(*) FILTER (WHERE conversation_id IS NULL OR btrim(conversation_id) = '')::int AS unassigned,
        count(*) FILTER (WHERE is_status_only)::int AS status_callbacks,
        count(*) FILTER (WHERE (conversation_id IS NULL OR btrim(conversation_id) = '') AND NOT is_status_only)::int AS unlinked_real_messages,
        count(*) FILTER (WHERE nullif(btrim(coalesce(source_record->>'Message ID', '')), '') IS NULL AND NOT is_status_only)::int AS legacy_missing_ids,
        (SELECT count(*)::int FROM public.messages m
          LEFT JOIN public.conversations c ON c.conversation_id = m.conversation_id
          WHERE m.conversation_id IS NOT NULL AND btrim(m.conversation_id) <> '' AND c.conversation_id IS NULL) AS invalid_conversation_links,
        (SELECT count(*)::int FROM public.conversations WHERE metadata->>'source' = 'neon_message_reconciliation') AS recovered_conversations,
        (SELECT count(*)::int FROM public.orders) AS orders
      FROM flagged
    `;
    const pageQa = await verifyPageDataPath();
    return NextResponse.json({ ok: true, mode: "neon_shadow", writes_enabled: false,
      totals: stats, page_qa: pageQa, source: "live_read_only_neon",
      note: "Unassigned messages are preserved for manual review, not auto-linked or deleted.",
    }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "summary_unavailable" }, { status: 503, headers });
  }
}
