import { NextResponse, type NextRequest } from "next/server";

/** Read by frontend/routes/container-layout.tsx. */
const SEARCH_HEADER = "x-arca-search";

/**
 * Hands the query string to the container route's layout.
 *
 * `/c/[ref]` redirects old and renamed links to the current readable address
 * (`app/c/[containerId]/layout.tsx`), and that redirect has to happen in the
 * LAYOUT: the page sits under a loading skeleton, and a redirect thrown after
 * the skeleton has streamed arrives as a second, client-side navigation rather
 * than a 307. Layouts are not given the query string, so this passes it along,
 * so the redirect keeps the open item, dialog or filter.
 */
export function proxy(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(SEARCH_HEADER, request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/c/:path*"] };
