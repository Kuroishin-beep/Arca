/**
 * GET /api/stream — the fan-out channel (SCOPE.md §8, M8).
 *
 * Server-Sent Events rather than a WebSocket, for the reason §4.2 records: a
 * serverless function cannot hold a bidirectional socket, and Arca does not
 * need one. Writes already travel as Server Actions; only the fan-out needs a
 * channel, and that is one-directional.
 *
 * The route is authorised like every other read — a principal or a 401. An
 * unauthenticated stream would be a way to watch a campaign's activity without
 * being in it, which is the leak §3 forbids in a different costume.
 */
import { repository } from "@backend/db";
import { currentPrincipal } from "@backend/lib/session";
import { campaignId } from "@backend/lib/campaign";
import { canRead } from "@backend/lib/permissions";
import { realtime } from "@backend/realtime";

/**
 * Route segment config for this handler lives in `app/api/stream/route.ts`, not
 * here. Next reads `runtime`, `dynamic` and `maxDuration` by statically
 * analysing the route file, and a value that arrives through a re-export is not
 * reliably seen. Getting that wrong drops this onto the Edge runtime, where
 * LISTEN has no socket to use — which would present as "realtime is broken"
 * rather than as a constant in the wrong file.
 *
 * What that file must declare, and why:
 *   runtime     "nodejs"        LISTEN needs a real socket.
 *   dynamic     "force-dynamic" an open connection, not a document.
 *   maxDuration 60              Vercel caps duration (60s on Hobby), so the
 *                               stream is DESIGNED to be cut off: EventSource
 *                               reconnects, the client shows syncing, and the
 *                               re-render is authoritative anyway. A drop
 *                               costs one refresh, not correctness — which is
 *                               what makes R1 survivable rather than fatal.
 */

/** Well under any proxy's idle timeout, and invisible to the client: a line
 *  starting with `:` is an SSE comment. */
const HEARTBEAT_MS = 25_000;

export async function GET(request: Request) {
  const principal = await currentPrincipal();
  if (!principal) {
    return new Response("Not signed in.", { status: 401 });
  }

  const encoder = new TextEncoder();
  const campaign = campaignId();

  /**
   * Which of these containers this viewer may open.
   *
   * Re-read per event rather than captured once, for the same reason
   * `currentSession` re-reads the role: a container revealed, or a player
   * removed from the table, must take effect on the next event rather than on
   * the next reconnect. Events are rare — one per write at the table — so this
   * is one indexed read per change, not per heartbeat.
   */
  const readableIds = async (ids: string[]): Promise<string[]> => {
    const containers = await repository().listContainers(principal);
    const allowed = new Set<string>(
      containers.filter((c) => canRead(principal, c)).map((c) => c.id),
    );
    return ids.filter((id) => allowed.has(id));
  };

  let unsubscribe: (() => Promise<void>) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      /**
       * Enqueueing onto a closed controller throws, and the close can happen
       * between a NOTIFY arriving and this running — a panel dismissed at the
       * wrong millisecond. Guarding here keeps that ordinary event from
       * surfacing as an unhandled rejection in the function logs.
       */
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const cleanup = async () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) await unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      // `retry:` tells EventSource how long to wait before reconnecting. Two
      // seconds keeps a reconnect inside M8's own budget: any change must be
      // visible to everyone else within two seconds.
      send(`retry: 2000\n\n`);
      send(
        `event: ready\ndata: ${JSON.stringify({
          transport: realtime().name,
          at: new Date().toISOString(),
        })}\n\n`,
      );

      try {
        unsubscribe = await realtime().subscribe(campaign, (event) => {
          // Filtered to what THIS viewer may read, before it leaves the
          // server. The event carries no contents — that was deliberate — but
          // it does carry container ids, and one channel for the whole
          // campaign meant every player was told the moment the GM moved
          // something inside an unrevealed container, and handed its id.
          // "Something happened in a place you cannot see" is exactly the kind
          // of thing a table reads aloud.
          //
          // `canRead` is the predicate the pages already use, so this is not a
          // second permission model; it is the existing one, one step earlier.
          void (async () => {
            try {
              const visible = await readableIds(event.containerIds);
              if (visible.length === 0) return;
              const filtered = { ...event, containerIds: visible };
              send(`event: change
data: ${JSON.stringify(filtered)}

`);
            } catch (error) {
              // Never kill the stream over this: the client re-renders from
              // the server, which is where authorisation actually lives.
              console.error("[arca] realtime filter failed", error);
            }
          })();
        });
      } catch (error) {
        console.error("[arca] realtime subscribe failed", error);
        // Tell the client plainly rather than hanging: it shows the offline
        // pill and falls back to reconnecting, instead of silently believing
        // stale data is live. A labelled stale panel is the M13 requirement.
        send(`event: fatal\ndata: {}\n\n`);
        await cleanup();
        return;
      }

      heartbeat = setInterval(() => {
        if (closed) return;
        send(`: ping\n\n`);
      }, HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        void cleanup();
      });
    },

    async cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) await unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Without this, a buffering proxy holds events until the stream ends —
      // which for a stream that never ends means delivering nothing at all.
      "X-Accel-Buffering": "no",
    },
  });
}
