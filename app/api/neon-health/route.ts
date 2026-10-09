import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

// Safe preview-only connectivity probe. No customer data or database credentials
// are returned. Protected preview deployments also require Vercel Authentication.
export async function GET() {
  if (process.env.CRM_READ_SOURCE !== "neon_shadow") {
    return NextResponse.json({ error: "Not available" }, { status: 404, headers });
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return NextResponse.json({ ok: false, database: "not_configured" }, { status: 503, headers });
  }
  try {
    const sql = neon(connectionString);
    const rows = await sql`
      SELECT
        (SELECT count(*)::int FROM public.messages) AS messages,
        (SELECT count(*)::int FROM public.orders) AS orders,
        (SELECT count(*)::int FROM public.conversations) AS conversations,
        (SELECT count(*)::int FROM public.migration_source_rows) AS staged_rows,
        (SELECT count(*)::int FROM public.migration_source_rows WHERE sheet_name = 'MESSAGES') AS staged_messages,
        (SELECT count(*)::int FROM public.migration_source_rows WHERE sheet_name = 'ORDERS') AS staged_orders,
        (SELECT max(imported_at) FROM public.migration_source_rows) AS latest_source_import
    `;
    const stats = rows[0] as {
      messages: number; orders: number; conversations: number;
      staged_rows: number; staged_messages: number; staged_orders: number;
      latest_source_import: string | null;
    } | undefined;
    if (!stats) throw new Error("Missing database summary");
    return NextResponse.json({
      ok: stats.messages === stats.staged_messages && stats.orders === stats.staged_orders,
      mode: "neon_shadow",
      writes_enabled: false,
      source: "isolated_neon_preview_branch",
      counts: {
        messages: stats.messages,
        orders: stats.orders,
        conversations: stats.conversations,
        staged_rows: stats.staged_rows,
        staged_messages: stats.staged_messages,
        staged_orders: stats.staged_orders,
      },
      latest_source_import: stats.latest_source_import,
      note: "Snapshot-only check; does not establish live parity with Google Sheets.",
    }, { headers });
  } catch {
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503, headers });
  }
}
