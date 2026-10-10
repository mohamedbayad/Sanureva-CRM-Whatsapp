import { NextRequest, NextResponse } from "next/server";
import { authIsConfigured, checkCrmPassword, CRM_SESSION_COOKIE, newCrmSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!authIsConfigured()) {
    return NextResponse.json({ error: "Ask the owner to configure CRM_DASHBOARD_PASSWORD in Vercel." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  if (!checkCrmPassword(password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  const session = newCrmSession();
  const landing = process.env.VERCEL_ENV === "preview" && process.env.CRM_READ_SOURCE === "neon_shadow" ? "/inbox-review" : "/";
  const response = NextResponse.json({ ok: true, landing });
  response.cookies.set(CRM_SESSION_COOKIE, session.value, {
    maxAge: session.maxAge,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
