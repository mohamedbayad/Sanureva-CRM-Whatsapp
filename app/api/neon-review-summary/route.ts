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
      SELECT
        (SELECT count(*)::int FROM public.messages) AS total_messages,
        (SELECT count(*)::int FROM public.messages WHERE conversation_id IS NULL OR btrim(conversation_id) = '') AS unassigned,
        (SELECT count(*)::int FROM public.messages m LEFT JOIN public.conversations c ON c.conversation_id = m.conversation_id
          WHERE m.conversation_id IS NOT NULL AND btrim(m.conversation_id) <> '' AND c.conversation_id IS NULL) AS invalid_conversation_links,
        (SELECT count(*)::int FROM public.conversations WHERE metadata->>'source' = 'neon_message_reconciliation') AS recovered_conversations,
        (SELECT count(*)::int FROM public.orders) AS orders,
        (SELECT count(*)::int FROM public.messages WHERE NULLIF(btrim(COALESCE(source_record->>'Message ID', '')), '') IS NULL) AS legacy_missing_ids
    `;
    return NextResponse.json({ ok: true, mode: "neon_shadow", writes_enabled: false,
      totals: stats, source: "live_read_only_neon",
      note: "Unassigned messages are preserved for manual review, not auto-linked or deleted.",
    }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "summary_unavailable" }, { status: 503, headers });
  }
}
