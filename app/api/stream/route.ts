/**
 * GET /api/stream — the realtime fan-out channel (M8).
 *
 * The handler is `backend/api/stream.ts`. Only the segment config lives here,
 * written out rather than re-exported: Next reads these by statically analysing
 * the route file, and a re-exported value is not reliably picked up. See the
 * note at the top of the handler.
 */

/** LISTEN needs a real socket, so this cannot run on the Edge runtime. */
export const runtime = "nodejs";
/** Never cached, never prerendered — an open connection, not a document. */
export const dynamic = "force-dynamic";
/** Vercel caps function duration; the stream is designed to be cut off and
 *  reconnected rather than to live forever. */
export const maxDuration = 60;

export { GET } from "@backend/api/stream";
