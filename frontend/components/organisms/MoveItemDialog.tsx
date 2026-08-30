"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { moveItemAction } from "@backend/actions/items";
import { Button } from "@frontend/components/atoms/Button";
import { ContainerDot } from "@frontend/components/atoms/Chip";
import { Icon } from "@frontend/components/atoms/Icon";
import { Modal } from "@frontend/components/molecules/Modal";
import { useOptimisticItems } from "@frontend/components/organisms/OptimisticItems";
import type { ContainerView, ItemView } from "@backend/domain/view";
import { encumbrance, weightPercent } from "@backend/domain/view";

export interface MoveTarget {
  container: ContainerView;
  /** `null` when the actor may write to it. */
  deniedReason: string | null;
}

/**
 * THE headline flow — SCOPE.md §8.1.
 *
 * Four decisions drive this component, in priority order:
 *
 *   1. The destination is the decision, so it gets the space and the targets.
 *   2. The consequence is shown BEFORE committing — both sides' weight after
 *      the move — because encumbrance is the thing a player is actually
 *      deciding about.
 *   3. Destinations the actor cannot write to are DISABLED WITH A REASON, never
 *      hidden.
 *   4. Partial moves are first-class. Splitting a stack is the common case at a
 *      table, not an edge case.
 *
 * It is a client component (unusually, for this app) precisely because of (2):
 * the preview has to track the quantity and destination as they change.
 */
export function MoveItemDialog({
  item,
  from,
  targets,
  closeHref,
}: {
  item: ItemView;
  from: ContainerView;
  targets: MoveTarget[];
  closeHref: string;
}) {
  const writable = targets.filter((t) => t.deniedReason === null);
  const [toId, setToId] = useState(writable[0]?.container.id ?? "");
  const [qty, setQty] = useState(item.qty);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { remove } = useOptimisticItems();
  const router = useRouter();

  const to = targets.find((t) => t.container.id === toId)?.container;

  // The preview. Derived, exactly like the real totals — the arithmetic here is
  // the same function the server will run, so what you are shown is what
  // happens.
  const preview = useMemo(() => {
    const moved = Math.min(Math.max(1, qty), item.qty) * item.weight;
    return {
      fromAfter: round1(from.carriedWeight - moved),
      toAfter: to ? round1(to.carriedWeight + moved) : 0,
    };
  }, [qty, item.qty, item.weight, from.carriedWeight, to]);

  const submit = () => {
    setError(null);
    const data = new FormData();
    data.set("itemId", item.id);
    data.set("toContainerId", toId);
    data.set("qty", String(qty));

    startTransition(async () => {
      // Inside the transition and BEFORE the await: this is what makes the row
      // leave the source list and both meters recompute immediately (§8.1
      // step 4). React reverts it when this transition settles.
      remove({ itemId: item.id, qty: Math.min(Math.max(1, qty), item.qty) });

      const result = await moveItemAction(data);
      if (!result.ok) {
        // The server is authoritative. On rejection the UI says why in the
        // dialog rather than closing and leaving the player guessing.
        setError(result.error ?? "That move was rejected.");
        return;
      }
      router.push(closeHref);
      router.refresh();
    });
  };

  return (
    <Modal
      title="Move item"
      subtitle={item.name}
      closeHref={closeHref}
      footer={
        <>
          <p className="mr-auto hidden text-xs text-faint sm:block">
            Applies for everyone at the table.
          </p>
          <Button
            variant="secondary"
            onClick={() => router.push(closeHref)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={pending || toId === ""}
          >
            {pending ? "Moving…" : "Move"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 p-4">
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-danger bg-danger-weak p-3 text-base text-text"
          >
            <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-danger" />
            <span>{error}</span>
          </p>
        ) : null}

        {/* ── Quantity ─────────────────────────────────────────────── */}
        <div>
          <label
            htmlFor="move-qty"
            className="mb-2 block text-sm font-medium text-muted"
          >
            How many?
          </label>
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center rounded-md border border-border bg-surface2">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="grid h-full w-10 place-items-center rounded-l-md text-muted hover:bg-surface3 hover:text-text"
              >
                <Icon name="minus" size={14} strokeWidth={2} />
                <span className="sr-only">Decrease quantity</span>
              </button>
              <input
                id="move-qty"
                type="number"
                min={1}
                max={item.qty}
                value={qty}
                onChange={(e) =>
                  setQty(clamp(Number(e.target.value), 1, item.qty))
                }
                className="h-full w-14 border-x border-border bg-transparent text-center font-mono text-base tabular-nums text-text"
              />
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(item.qty, q + 1))}
                className="grid h-full w-10 place-items-center rounded-r-md text-muted hover:bg-surface3 hover:text-text"
              >
                <Icon name="plus" size={14} strokeWidth={2} />
                <span className="sr-only">Increase quantity</span>
              </button>
            </div>
            {item.qty > 1 ? (
              <Button size="sm" onClick={() => setQty(item.qty)}>
                Move all {item.qty}
              </Button>
            ) : null}
            <span className="ml-auto font-mono text-xs text-faint">
              of {item.qty}
            </span>
          </div>
          {qty < item.qty ? (
            <p className="mt-2 text-sm text-muted">
              Moving part of a stack splits it. One stays, one arrives.
            </p>
          ) : null}
        </div>

        {/* ── From / To ────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 rounded-md border border-border bg-surface2 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-faint">
              From
            </p>
            <div className="flex items-center gap-2">
              <ContainerDot type={from.type} />
              <span className="min-w-0 truncate text-base text-text">
                {from.name}
              </span>
            </div>
          </div>
          <Icon
            name="arrow-right"
            size={18}
            strokeWidth={2}
            className="shrink-0 text-primary"
          />
          <div className="min-w-0 flex-1 rounded-md border border-primary bg-primary-weak p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-primary">
              To
            </p>
            <div className="flex items-center gap-2">
              {to ? <ContainerDot type={to.type} /> : null}
              <span className="min-w-0 truncate text-base font-medium text-text">
                {to?.name ?? "Pick one"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Destination ──────────────────────────────────────────── */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-muted">
            Destination
          </legend>
          <ul className="flex flex-col gap-1">
            {targets.map(({ container, deniedReason }) => {
              const disabled = deniedReason !== null;
              const selected = container.id === toId;
              return (
                <li key={container.id}>
                  <label
                    title={deniedReason ?? undefined}
                    className={[
                      "flex h-11 items-center gap-3 rounded-md border px-3",
                      disabled
                        ? "cursor-not-allowed border-border opacity-70"
                        : selected
                          ? "cursor-pointer border-primary bg-primary-weak"
                          : "cursor-pointer border-border hover:bg-surface2",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="dest"
                      className="h-4 w-4 shrink-0"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => setToId(container.id)}
                    />
                    {disabled ? (
                      <Icon name="lock" size={14} className="shrink-0 text-faint" />
                    ) : (
                      <ContainerDot type={container.type} />
                    )}
                    <span
                      className={`min-w-0 flex-1 truncate text-base ${
                        disabled
                          ? "text-faint"
                          : selected
                            ? "font-medium text-text"
                            : "text-text"
                      }`}
                    >
                      {container.name}
                    </span>
                    {/* The reason is stated, not implied. */}
                    <span className="shrink-0 text-xs text-faint">
                      {deniedReason
                        ? deniedReason.includes("GM-only")
                          ? "GM-only"
                          : "Not yours"
                        : container.type === "party"
                          ? "Shared"
                          : container.type === "character"
                            ? "Pack"
                            : "World"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {/* ── Consequence, before committing ───────────────────────── */}
        {to ? (
          <div className="rounded-md border border-border bg-surface2 p-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-faint">
              After this move
            </p>
            <div className="flex flex-col gap-3">
              <PreviewBar
                label={from.name}
                before={from.carriedWeight}
                after={preview.fromAfter}
                capacity={from.capacity}
              />
              <PreviewBar
                label={to.name}
                before={to.carriedWeight}
                after={preview.toAfter}
                capacity={to.capacity}
              />
            </div>
            {to.capacity !== null &&
            encumbrance(preview.toAfter, to.capacity) !== "ok" ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-warning">
                <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                {encumbrance(preview.toAfter, to.capacity) === "over"
                  ? `This puts ${to.name} over its carry limit. Allowed — just slow.`
                  : `This puts ${to.name} at its carry limit.`}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function PreviewBar({
  label,
  before,
  after,
  capacity,
}: {
  label: string;
  before: number;
  after: number;
  capacity: number | null;
}) {
  const state = encumbrance(after, capacity);
  const fill =
    state === "over"
      ? "bg-danger"
      : state === "at-limit"
        ? "bg-warning"
        : "bg-accent";
  const tone =
    state === "over"
      ? "text-danger"
      : state === "at-limit"
        ? "text-warning"
        : "text-success";

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm text-muted">{label}</span>
        <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
          {before.toFixed(1)} → <span className={tone}>{after.toFixed(1)}</span>
          {capacity !== null ? ` / ${capacity.toFixed(1)} kg` : " kg"}
        </span>
      </div>
      {capacity !== null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface3">
          <div
            className={`h-full rounded-full ${fill}`}
            style={{ width: `${weightPercent(after, capacity)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

const clamp = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : min;

const round1 = (n: number) => Math.round(n * 10) / 10;
