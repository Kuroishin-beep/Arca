/**
 * The realtime boundary — SCOPE.md §10 R1.
 *
 * R1 is the project's largest technical unknown, and the mitigation it asks for
 * is structural rather than clever: put the fan-out behind ONE interface with
 * more than one implementation, so the transport can be swapped at config
 * without touching a component. That is the same boundary `backend/db/repository.ts`
 * draws around storage, applied to delivery.
 *
 * Two implementations ship here:
 *
 *   - `postgres` — Postgres LISTEN/NOTIFY, selected whenever DATABASE_URL is
 *                  set. This is the real one. It works on serverless because
 *                  the database, not the function, holds the channel.
 *   - `local`    — an in-process emitter for fixture mode, so `npm run dev`
 *                  demonstrates live sync with no database. It is explicitly
 *                  NOT valid in production: Vercel functions are stateless and
 *                  two invocations do not share memory (SCOPE.md §4.1).
 *
 * A Supabase Realtime implementation — the fallback R1 names — is a third
 * module implementing this same interface. The seam is what R1 asks for; the
 * module is not written until SSE is measured against a real session.
 *
 * Note the asymmetry with `revalidatePath`: a Server Action revalidating its
 * own caller only updates the person who acted. The whole point of M8 is the
 * OTHER five people at the table, and nothing in Next's cache does that.
 */

/**
 * What crosses the wire.
 *
 * Deliberately a notification, not a diff. The event says "something in these
 * containers changed"; the client then re-renders from the server, which is
 * already authorised per viewer. Shipping the changed rows themselves would
 * mean re-implementing the permission model on the channel — the exact
 * "second codepath" SCOPE.md §3 exists to avoid, and the way a GM-only item
 * leaks into a player's panel.
 */
export interface ArcaEvent {
  kind: "items-changed";
  /** Containers whose contents are now stale. A move touches two. */
  containerIds: string[];
  /** Who caused it, so a client can skip refreshing on its own echo. */
  actorId: string;
  /** ISO timestamp, for the "last synced" reading on the pill (M13). */
  at: string;
}

export type Unsubscribe = () => Promise<void>;

export interface RealtimeTransport {
  /** For diagnostics and the sign-in screen's "which backend is live" line. */
  readonly name: "postgres" | "local";
  publish(campaignId: string, event: ArcaEvent): Promise<void>;
  subscribe(
    campaignId: string,
    onEvent: (event: ArcaEvent) => void,
  ): Promise<Unsubscribe>;
}

export type RealtimeKind = RealtimeTransport["name"];

/** Mirrors `repositoryKind()`: the transport follows the storage backend. */
export function realtimeKind(): RealtimeKind {
  return process.env.DATABASE_URL ? "postgres" : "local";
}

/**
 * Postgres identifiers cap at 63 bytes and a channel name is an identifier, so
 * the campaign uuid is folded into something safe rather than interpolated raw.
 */
export function channelFor(campaignId: string): string {
  return `arca_${campaignId.replace(/[^a-zA-Z0-9]/g, "_")}`.slice(0, 63);
}

/**
 * Required lazily, exactly as `backend/db/index.ts` does, so fixture mode never
 * loads the Postgres driver.
 */
export function realtime(): RealtimeTransport {
  if (realtimeKind() === "local") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("./local-channel") as typeof import("./local-channel");
    return mod.localTransport;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod =
    require("./postgres-channel") as typeof import("./postgres-channel");
  return mod.postgresTransport;
}
