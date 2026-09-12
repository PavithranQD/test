import { NextRequest, NextResponse } from "next/server";
// Imported from this specific submodule (not the "@repo/core" barrel) so the
// Edge runtime bundle doesn't try to pull in node:crypto/bcrypt/Prisma via
// index.ts's re-exports — this constant is deliberately kept dependency-free.
import { SESSION_COOKIE_NAME } from "@repo/core/src/security/constants";

// Edge-runtime cookie presence check only (fast redirect for UX). Prisma/
// bcrypt can't run on the Edge runtime, so the actual session validity check
// happens server-side in requireUser() (apps/web/lib/session.ts) on every
// protected page/route — this middleware is a UX shortcut, not the
// authorization boundary.
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/shopify/webhooks"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSessionCookie && !pathname.startsWith("/_next")) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
