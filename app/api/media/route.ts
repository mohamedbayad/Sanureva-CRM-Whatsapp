import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { verifyCrmSession, CRM_SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";
const IS_PREVIEW = process.env.VERCEL_ENV === "preview" &&
  process.env.CRM_READ_SOURCE === "neon_shadow" &&
  process.env.CRM_PREVIEW_DIRECT_READ === "1";
// Preview media can only use a separately scoped download endpoint.
// Never send its requests to the n8n API endpoint that also permits sending.
const SECRET = ((IS_PREVIEW
  ? process.env.CRM_PREVIEW_SESSION_SECRET : process.env.N8N_CRM_API_KEY) || "").trim();
const GATEWAY = ((IS_PREVIEW
  ? process.env.N8N_MEDIA_READ_WEBHOOK_URL : process.env.N8N_CRM_WEBHOOK_URL) || "").trim();
const PREVIEW_MEDIA_KEY = (process.env.N8N_MEDIA_READ_KEY || "").trim();
const MAX_SIZE = 16 * 1024 * 1024;

export async function GET(request: NextRequest) {
  if (!verifyCrmSession(request.cookies.get(CRM_SESSION_COOKIE)?.value)) {
    return new Response("Sign in required", { status: 401 });
  }
  const query = request.nextUrl.searchParams;
  const id = query.get("id") || "";
  const kind = query.get("kind") || "";
  const exp = Number(query.get("exp") || 0);
  const sig = query.get("sig") || "";
  const now = Math.floor(Date.now() / 1000);
  if (!SECRET || !GATEWAY || (IS_PREVIEW && !PREVIEW_MEDIA_KEY)) {
    return new Response("Media integration not configured", { status: 503 });
  }
  if (IS_PREVIEW) {
    try {
      const endpoint = new URL(GATEWAY);
      if (endpoint.protocol !== "https:" || !endpoint.pathname.startsWith("/webhook/")) {
        return new Response("Preview media gateway is not a secure read-only webhook", { status: 503 });
      }
    } catch {
      return new Response("Preview media gateway URL invalid", { status: 503 });
    }
  }
  if (!/^\d{8,30}$/.test(id) || !["image","audio","video","document"].includes(kind) ||
    !Number.isInteger(exp) || exp < now || exp > now + 3600 ||
    !/^[a-f0-9]{64}$/.test(sig)) {
    return new Response("Invalid or expired link", { status: 403 });
  }
  const expected = createHmac("sha256", SECRET).update(kind + ":" + id + ":" + exp).digest();
  const actual = Buffer.from(sig, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return new Response("Invalid media signature", { status: 403 });
  }
  try {
    const upstream = await fetch(GATEWAY, {
      method: "POST",
      headers: IS_PREVIEW
        ? { "Content-Type": "application/json", "X-Preview-Media-Key": PREVIEW_MEDIA_KEY }
        : { "Content-Type": "application/json", "X-CRM-Key": SECRET },
      body: IS_PREVIEW
        ? JSON.stringify({ media_id: id })
        : JSON.stringify({ action: "get_media", media_id: id }),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!upstream.ok) return new Response("Original WhatsApp media unavailable", { status: 404 });
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_SIZE) {
      return new Response("Media is empty or too large", { status: 413 });
    }
    const fromApi = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const fallback: Record<string,string> = {
      image: "image/jpeg", audio: "audio/ogg", video: "video/mp4", document: "application/pdf",
    };
    const mime = /^(image|audio|video)\/[a-z0-9.+-]+$/.test(fromApi) || fromApi === "application/pdf"
      ? fromApi : fallback[kind];
    const headers = new Headers({
      "Content-Type": mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Accept-Ranges": "bytes",
    });
    const range = request.headers.get("range");
    if (range) {
      const parsed = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!parsed) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + bytes.length } });
      const start = Number(parsed[1]);
      const end = parsed[2] ? Math.min(Number(parsed[2]), bytes.length - 1) : bytes.length - 1;
      if (start >= bytes.length || end < start) {
        return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + bytes.length } });
      }
      headers.set("Content-Range", "bytes " + start + "-" + end + "/" + bytes.length);
      headers.set("Content-Length", String(end-start+1));
      return new Response(new Uint8Array(bytes.slice(start,end+1)), { status: 206, headers });
    }
    headers.set("Content-Length", String(bytes.length));
    return new Response(new Uint8Array(bytes), { headers });
  } catch {
    return new Response("Could not retrieve WhatsApp attachment", { status: 502 });
  }
}
