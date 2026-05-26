// Phase 9: gate `/api/**` and the app pages behind a NextAuth session.
//
// Exempt paths:
//   - /api/auth/**        — NextAuth itself.
//   - /api                — health check (lets the janitor sweep on first hit).
//   - /auth/**            — sign-in / sign-out pages.
//
// This is the perimeter check. Per-row IDOR (e.g. "is this repository owned by
// the current user?") is the responsibility of each handler — track that
// follow-up under a TODO; see plan Phase 9.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_API_PREFIXES = ["/api/auth", "/api"];

function isPublicApiPath(pathname: string): boolean {
  // Public probes:
  //   /api          — liveness ping + kicks the janitor.
  //   /api/metrics  — Prometheus scrape.
  //   /api/healthz  — deep dependency probe (Polish P6.1).
  // Subpaths under /api/auth (NextAuth) are always public.
  if (pathname === "/api") return true;
  if (pathname === "/api/metrics") return true;
  if (pathname === "/api/healthz") return true;
  return pathname.startsWith("/api/auth");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = pathname.startsWith("/api/") || pathname === "/" || /^\/(dashboard|repositories|radar|adr|c4|openapi|context-map|settings)/.test(pathname);
  if (!needsAuth) return NextResponse.next();
  if (pathname.startsWith("/api/") && isPublicApiPath(pathname)) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/auth/signin";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Match every route the middleware cares about. _next, favicon, static
  // assets, and the public folder are excluded by the negative lookahead.
  matcher: ["/((?!_next/|favicon\\.ico|logo\\.svg|robots\\.txt).*)"],
};

// Silence the `PUBLIC_API_PREFIXES` "declared but never used" warning under
// the temporary middleware structure — kept for readability and to make the
// allow-list trivially extensible.
export const _publicPrefixes = PUBLIC_API_PREFIXES;
