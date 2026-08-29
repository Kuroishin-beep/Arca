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
import { currentPrincipal } from "@/lib/session";
import { campaignId } from "@/lib/campaign";
import { realtime } from "@/realtime";

/** LISTEN needs a real socket, so this cannot run on the Edge runtime. */
export const runtime = "nodejs";
/** Never cached, never prerendered — it is an open connection, not a document. */
export const dynamic = "force-dynamic";
/**
 * Vercel caps function duration (60s on Hobby). The stream is therefore
 * DESIGNED to be cut off: EventSource reconnects on its own, the client marks
 * itself syncing while it does, and a reconnect re-renders from the server,
 * which is authoritative anyway. A dropped connection costs one refresh, not
 * correctness — which is what makes R1 survivable rather than fatal.
 */
export const maxDuration = 60;

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
          send(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
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
