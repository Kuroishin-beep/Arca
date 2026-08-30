"use client";

import {
  createContext,
  useContext,
  useOptimistic,
  type ReactNode,
} from "react";

import {
  type ContainerView,
  type ItemView,
  carriedWeight,
} from "@backend/domain/view";
import { WeightMeter } from "@frontend/components/molecules/WeightMeter";

/**
 * Optimistic item state — SCOPE.md §8.1 step 4 and the phase 3 exit criterion.
 *
 * A move must FEEL instant: the row leaves the source list and both weight
 * meters recompute before the server has answered. That is a client concern,
 * and it is the reason this provider exists.
 *
 * ── The trade this makes ──────────────────────────────────────────────
 * The workspace page's own comment says the item table renders on the server
 * "so a docked panel paints without first shipping the whole dataset as JSON".
 * Optimistic removal contradicts that: to hide a row before the server replies,
 * the rows must be client state, which means the items DO cross as JSON.
 *
 * It is taken deliberately, on §4.1's terms — peak concurrency is under ten
 * users and a container holds tens of items, so "optimise for correctness and
 * clarity, not throughput" points at the responsive move rather than at the
 * smaller payload. If a container ever holds thousands of items, this is the
 * decision to revisit first.
 * ─────────────────────────────────────────────────────────────────────
 *
 * `useOptimistic` is the right primitive rather than `useState` because the
 * revert is automatic: the optimistic value survives exactly as long as the
 * transition that set it. When the Server Action resolves and the new server
 * render arrives, the guess is dropped and the truth replaces it — R4's
 * "server event is always authoritative; client reconciles rather than merges",
 * enforced by the API instead of by discipline.
 */

/** A quantity leaving a container. A partial move removes some of a stack, so
 *  this is not simply a set of ids. */
export interface PendingRemoval {
  itemId: string;
  qty: number;
}

interface OptimisticContext {
  pending: PendingRemoval[];
  /** MUST be called inside a transition — that is what scopes the revert. */
  remove: (removal: PendingRemoval) => void;
}

const Ctx = createContext<OptimisticContext | null>(null);

export function OptimisticItemsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [pending, addPending] = useOptimistic<
    PendingRemoval[],
    PendingRemoval
  >([], (state, removal) => [...state, removal]);

  return (
    <Ctx.Provider value={{ pending, remove: addPending }}>
      {children}
    </Ctx.Provider>
  );
}

/**
 * Returns a no-op outside the provider rather than throwing. The dialogs are
 * also rendered on screens that have no item table, and a missing optimistic
 * layer should degrade to "not optimistic", never to a crash on the one flow
 * the whole app exists for.
 */
export function useOptimisticItems(): OptimisticContext {
  return useContext(Ctx) ?? { pending: [], remove: () => {} };
}

/** Applies pending removals to a server-rendered list. */
export function applyPending(
  items: readonly ItemView[],
  pending: readonly PendingRemoval[],
): ItemView[] {
  if (pending.length === 0) return [...items];

  const removed = new Map<string, number>();
  for (const p of pending) {
    removed.set(p.itemId, (removed.get(p.itemId) ?? 0) + p.qty);
  }

  return items.flatMap((item) => {
    const gone = removed.get(item.id);
    if (gone === undefined) return [item];
    // A partial move leaves the remainder behind; a full one leaves nothing.
    const left = item.qty - gone;
    return left > 0 ? [{ ...item, qty: left }] : [];
  });
}

/**
 * The footer meter, recomputed against the optimistic list.
 *
 * It derives its total with the same `carriedWeight` the server uses, so the
 * number shown mid-move is the number that will be there afterwards — not a
 * separately maintained guess that can disagree.
 */
export function OptimisticWeightMeter({
  items,
  container,
}: {
  items: ItemView[];
  container: ContainerView;
}) {
  const { pending } = useOptimisticItems();
  const live = applyPending(items, pending);

  return (
    <>
      <span className="shrink-0 font-mono text-xs text-muted">
        {live.reduce((n, i) => n + i.qty, 0)} items
      </span>
      <WeightMeter
        carried={carriedWeight(live)}
        capacity={container.capacity}
      />
    </>
  );
}
