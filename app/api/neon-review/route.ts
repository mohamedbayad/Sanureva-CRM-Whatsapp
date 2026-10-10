import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";
import { CRM_SESSION_COOKIE, verifyCrmSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

// Private review data. Preview mode only, session-authenticated, strictly SELECT-only.
// No attempt is made to infer a customer phone or rewrite the original messages.
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview" || process.env.CRM_READ_SOURCE !== "neon_shadow") {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }
  if (!verifyCrmSession(request.cookies.get(CRM_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401, headers });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503, headers });
  }
  try {
    const sql = neon(process.env.DATABASE_URL);
    const [unassigned, recovered, recoveredMessages] = await Promise.all([
      sql`
        SELECT
          id::text AS id,
          occurred_at AS timestamp,
          direction, message_kind AS kind,
          coalesce(nullif(message_text, ''), nullif(caption, ''),
            nullif(source_record->>'Message Content Snippet', ''), '') AS preview_text,
          coalesce(delivery_status, '') AS delivery_status,
          coalesce(whatsapp_wamid, '') AS whatsapp_wamid,
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
        FROM public.messages
        WHERE conversation_id IS NULL OR btrim(conversation_id) = ''
        ORDER BY occurred_at DESC, id DESC LIMIT 100
      `,
      sql`
        SELECT c.conversation_id, c.customer_phone,
          coalesce(c.customer_name, '') AS customer_name,
          c.started_at, c.last_message_at,
          (SELECT count(*)::int FROM public.messages m WHERE m.conversation_id = c.conversation_id) AS message_count,
          coalesce(c.status, '') AS status
        FROM public.conversations c
        WHERE c.metadata->>'source' = 'neon_message_reconciliation'
        ORDER BY c.last_message_at DESC NULLS LAST LIMIT 50
      `,
      sql`
        SELECT m.conversation_id, m.occurred_at AS timestamp, m.direction,
          coalesce(nullif(m.message_text, ''), nullif(m.caption, ''),
            nullif(m.source_record->>'Message Content Snippet', ''), '') AS preview_text
        FROM public.messages m
        WHERE m.conversation_id IN
          (SELECT c.conversation_id FROM public.conversations c
            WHERE c.metadata->>'source' = 'neon_message_reconciliation')
        ORDER BY m.occurred_at DESC, m.id DESC LIMIT 80
      `
    ]);
    return NextResponse.json({
      ok: true, readonly: true,
      unassigned, recovered, recovered_messages: recoveredMessages,
      note: "Unassigned messages remain uncategorized until a verified source identifies the owner.",
    }, { headers });
  } catch {
    return NextResponse.json({ error: "inbox_review_unavailable" }, { status: 503, headers });
  }
}
