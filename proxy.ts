import { NextRequest, NextResponse } from "next/server";
import { authIsConfigured, CRM_SESSION_COOKIE, verifyCrmSession } from "./lib/auth";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAuth = pathname === "/login" || pathname === "/api/auth/login";
  const isReady = authIsConfigured();
  const signedIn = verifyCrmSession(request.cookies.get(CRM_SESSION_COOKIE)?.value);
  if (isAuth) {
    if (pathname === "/login" && signedIn) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  if (!isReady || !signedIn) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: isReady ? "Sign in to access Sanureva CRM" : "CRM_DASHBOARD_PASSWORD must be configured" },
        { status: isReady ? 401 : 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
