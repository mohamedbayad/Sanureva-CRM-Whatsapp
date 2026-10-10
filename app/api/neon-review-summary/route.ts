import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";
import { POST as crmLogin } from "@/app/api/auth/login/route";
import { GET as fetchOriginalMedia } from "@/app/api/media/route";
import { CRM_SESSION_COOKIE } from "@/lib/auth";
import { proxy as crmProxy } from "@/proxy";
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

// Temporary, non-disclosing QA: directly invoke the same Login, protected-route
// middleware and original binary media handlers used by actual customer pages.
// Never return cookie values, identifiers, customer text or original media bytes.
async function verifyPreviewEndToEnd(): Promise<Record<string, unknown>> {
  try {
    if (process.env.VERCEL_ENV !== "preview" ||
        process.env.CRM_READ_SOURCE !== "neon_shadow") {
      return { ok: false, reason: "not_isolated_preview" };
    }
    const origin = "https://sanureva-preview-qa.invalid";
    const badLoginRequest = new NextRequest(origin + "/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "intentionally-invalid-qa-password" }),
    });
    const badLogin = await crmLogin(badLoginRequest);
    const goodLoginRequest = new NextRequest(origin + "/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: process.env.CRM_REVIEW_PASSWORD || "" }),
    });
    const goodLogin = await crmLogin(goodLoginRequest);
    const session = goodLogin.cookies.get(CRM_SESSION_COOKIE)?.value || "";
    const cookieHeader = CRM_SESSION_COOKIE + "=" + session;
    const pages: Record<string, boolean> = {};
    for (const page of ["/", "/inbox", "/orders", "/inbox-review"]) {
      const unauth = crmProxy(new NextRequest(origin + page));
      const authed = crmProxy(new NextRequest(origin + page, {
        headers: { cookie: cookieHeader },
      }));
      pages[page] = (unauth.status === 307 || unauth.status === 308) &&
        authed.headers.get("x-middleware-next") === "1";
    }
    const snapshot = await getSnapshot();
    const messages = snapshot.sheets[SHEET_NAMES.messages] || [];
    const mediaChecks: Record<string, unknown> = {};
    for (const kind of ["image", "audio"]) {
      const media = messages.find(m =>
        cleanDisplay(m["Media Kind"]).toLowerCase() === kind &&
        cleanDisplay(m["Media URL"]).startsWith("/api/media?")
      );
      if (!media) { mediaChecks[kind] = { ok: false, reason: "missing_signed_link" }; continue; }
      const u = new URL(cleanDisplay(media["Media URL"]), origin);
      const unsigned = await fetchOriginalMedia(new NextRequest(u));
      const changed = new URL(u);
      changed.searchParams.set("sig", "0".repeat(64));
      const tampered = await fetchOriginalMedia(new NextRequest(changed, {
        headers: { cookie: cookieHeader },
      }));
      const successful = await fetchOriginalMedia(new NextRequest(u, {
        headers: { cookie: cookieHeader },
      }));
      const mime = (successful.headers.get("content-type") || "").split(";")[0];
      const blob = await successful.arrayBuffer();
      // Only return mime, count and status; never return binary or WhatsApp IDs.
      mediaChecks[kind] = {
        ok: successful.status === 200 && blob.byteLength > 100 &&
          mime.startsWith(kind + "/") && unsigned.status === 401 &&
          tampered.status === 403,
        http_status: successful.status, mime_type: mime,
        nonempty_bytes: blob.byteLength > 100,
        anonymous_status: unsigned.status,
        invalid_signature_status: tampered.status,
      };
    }
    const imageOk = Boolean((mediaChecks.image as { ok?: boolean })?.ok);
    const audioOk = Boolean((mediaChecks.audio as { ok?: boolean })?.ok);
    const authOk = badLogin.status === 401 && goodLogin.status === 200 &&
      session.length > 30 && Object.values(pages).every(Boolean);
    return {
      ok: authOk && imageOk && audioOk,
      login: { rejected_wrong_password: badLogin.status === 401,
        valid_login_succeeded: goodLogin.status === 200 },
      authenticated_pages: pages,
      media: mediaChecks,
      scope: "Preview route-handler integration; not browser visual playback",
    };
  } catch {
    return { ok: false, reason: "preview_end_to_end_probe_failed" };
  }
}

// Aggregate-only data-quality checks. No customer data or message bodies leave this endpoint.
export async function GET(request: NextRequest) {
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
    const preview_e2e_probe = request.nextUrl.searchParams.get("probe_media") === "1"
      ? await verifyPreviewEndToEnd() : undefined;
    return NextResponse.json({ ok: true, mode: "neon_shadow", writes_enabled: false,
      totals: stats, page_qa: pageQa, ...(preview_e2e_probe ? { preview_e2e_probe } : {}),
      source: "live_read_only_neon",
      note: "Unassigned messages are preserved for manual review, not auto-linked or deleted.",
    }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "summary_unavailable" }, { status: 503, headers });
  }
}
