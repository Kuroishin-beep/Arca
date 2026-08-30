/**
 * Postgres LISTEN/NOTIFY — the real transport.
 *
 * The reason this works on Vercel and a WebSocket does not (SCOPE.md §4.2):
 * the long-lived thing is the DATABASE's channel, not the function. A function
 * that wakes up, LISTENs, and streams what arrives until the client goes away
 * is entirely within what a serverless runtime can do. Nothing is held between
 * invocations, which is the constraint §4.1 states.
 *
 * postgres.js multiplexes every `listen()` on one dedicated connection rather
 * than taking one from the pool per subscriber, so a table of six people with a
 * panel open each is one connection, not six. That matters against the
 * connection ceiling `client.ts` is already careful about.
 */
import type { ArcaEvent, RealtimeTransport } from "./index";
import { channelFor } from "./index";
import { rawSql } from "@backend/db/client";

/**
 * A payload that is not the shape we expect means a NOTIFY from something other
 * than this app — or an older deploy mid-rollout. Dropping it is right: the
 * client's fallback is a stale panel that the next real event fixes, and a
 * thrown error inside the notify handler would take down the listener for
 * everyone sharing that connection.
 */
function parse(payload: string): ArcaEvent | null {
  try {
    const raw: unknown = JSON.parse(payload);
    if (typeof raw !== "object" || raw === null) return null;
    const e = raw as Partial<ArcaEvent>;
    if (e.kind !== "items-changed") return null;
    if (!Array.isArray(e.containerIds)) return null;
    if (typeof e.actorId !== "string" || typeof e.at !== "string") return null;
    return {
      kind: "items-changed",
      containerIds: e.containerIds.filter(
        (c): c is string => typeof c === "string",
      ),
      actorId: e.actorId,
      at: e.at,
    };
  } catch {
    return null;
  }
}

export const postgresTransport: RealtimeTransport = {
  name: "postgres",

  async publish(campaignId, event) {
    // NOTIFY caps its payload at 8000 bytes. The event carries ids and a
    // timestamp, never item rows, so it cannot approach that — which is a
    // second reason the event is a notification rather than a diff.
    await rawSql().notify(channelFor(campaignId), JSON.stringify(event));
  },

  async subscribe(campaignId, onEvent) {
    const subscription = await rawSql().listen(
      channelFor(campaignId),
      (payload: string) => {
        const event = parse(payload);
        if (event) onEvent(event);
      },
    );

    return async () => {
      try {
        await subscription.unlisten();
      } catch {
        // The connection is already gone — which is the normal way this ends
        // when a panel is closed. Nothing to recover.
      }
    };
  },
};
