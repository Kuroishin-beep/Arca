import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@backend/lib/session-cookie";
import { sessionSecret, verifySession } from "@backend/lib/session-token";

/** Read by frontend/routes/container-layout.tsx. */
const SEARCH_HEADER = "x-arca-search";

/**
 * Two small jobs on every page request.
 *
 * 1. Hands the query string to the container route's layout. `/c/[ref]`
 *    redirects old and renamed links to the current readable address
 *    (`app/c/[containerId]/layout.tsx`), and that redirect has to happen in the
 *    LAYOUT — the page sits under a loading skeleton, and a redirect thrown
 *    after the skeleton has streamed arrives as a second, client-side
 *    navigation rather than a 307. Layouts are not given the query string.
 *
 * 2. Keeps an active player signed in. The session cookie lasts 30 days; each
 *    visit with a VALID one restarts that clock, so someone who opens Arca in
 *    TaleSpire every week never sees the sign-in screen again, while a device
 *    left unused for a month is signed out. Only a cookie we signed is renewed
 *    — renewing a forged one would launder it.
 */
export function proxy(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(SEARCH_HEADER, request.nextUrl.search);
  const response = NextResponse.next({ request: { headers } });

  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (session && verifySession(session, sessionSecret())) {
    response.cookies.set(SESSION_COOKIE_NAME, session, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
  }
  return response;
}

export const config = {
  // Pages and server actions; not static assets, the image optimiser, or the
  // long-lived live-update stream (its response is already open).
  matcher: ["/((?!_next/static|_next/image|api/stream|icon.svg|apple-icon.png).*)"],
};
