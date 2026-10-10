import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

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
    return NextResponse.json({ ok: true, mode: "neon_shadow", writes_enabled: false,
      totals: stats, source: "live_read_only_neon",
      note: "Unassigned messages are preserved for manual review, not auto-linked or deleted.",
    }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "summary_unavailable" }, { status: 503, headers });
  }
}
