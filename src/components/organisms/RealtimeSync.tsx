"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { SyncPill, type SyncStatus } from "@/components/atoms/Status";

/**
 * The client half of M8, and the honest source for M13's pill.
 *
 * One EventSource per panel. When the campaign channel says something changed,
 * this asks the server to re-render — it does NOT patch a client-side cache.
 * That is R4's mitigation taken literally: the server event is authoritative
 * and the client reconciles by re-reading, so an optimistic update that
 * guessed wrong is corrected by the next render rather than merged into a
 * state no one can reason about.
 *
 * Re-rendering from the server also keeps the permission model in one place.
 * The refreshed page is built against the viewer's own principal, so an event
 * about a container this player cannot read produces a render containing
 * nothing new — no client-side filtering, and nothing to get wrong.
 */
export function RealtimeSync({
  userId,
  className = "",
}: {
  /** Used to ignore this panel's own echo — the actor was already refreshed by
   *  the Server Action's `revalidatePath`, so acting on it is a second,
   *  visible-as-a-flicker render for nothing. */
  userId: string;
  className?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatus>("syncing");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | undefined>();

  /**
   * `router` identity is not stable across renders, and refreshing changes the
   * render — so depending on it directly would tear down and rebuild the
   * EventSource on every refresh, which is an endless reconnect loop rather
   * than a subscription. The ref keeps the effect's dependency list empty.
   */
  const refresh = useRef(() => router.refresh());
  refresh.current = () => router.refresh();

  useEffect(() => {
    const source = new EventSource("/api/stream");
    /** Coalesces a burst — a partial move writes both ends — into one render. */
    let pending: ReturnType<typeof setTimeout> | null = null;

    source.addEventListener("ready", () => {
      setStatus("idle");
      setLastSyncedAt(new Date());
    });

    source.addEventListener("change", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as {
          actorId?: string;
        };
        if (data.actorId === userId) {
          // Our own write, already reflected. Still a sign of a live channel.
          setLastSyncedAt(new Date());
          return;
        }
      } catch {
        // An unparseable event still means the channel is alive and something
        // changed, so fall through and refresh rather than ignoring it.
      }

      setStatus("syncing");
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        refresh.current();
        setStatus("idle");
        setLastSyncedAt(new Date());
      }, 50);
    });

    /** The server could not reach the channel at all. Reconnecting would just
     *  fail again, so stop and say so rather than looping. */
    source.addEventListener("fatal", () => {
      setStatus("error");
      source.close();
    });

    source.onerror = () => {
      // EventSource reconnects by itself; CONNECTING means it is already
      // trying, and calling that "Offline" would flash a red pill on every
      // routine function timeout. Only a CLOSED source is actually offline.
      setStatus(source.readyState === EventSource.CLOSED ? "error" : "syncing");
    };

    return () => {
      if (pending) clearTimeout(pending);
      source.close();
    };
  }, [userId]);

  return (
    <SyncPill status={status} lastSyncedAt={lastSyncedAt} className={className} />
  );
}
