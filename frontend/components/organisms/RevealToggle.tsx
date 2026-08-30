"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setContainerRevealedAction } from "@backend/actions/containers";
import { Icon } from "@frontend/components/atoms/Icon";

/**
 * Reveal a world container to the table — GM only, one click.
 *
 * This is the moment the feature exists for: the party opens the barrow and the
 * chest has to become visible to five other panels immediately. Before this it
 * was an UPDATE typed into psql mid-session.
 *
 * Hidden is the DEFAULT and the safe state, so the control is weighted that
 * way: revealing is a plain button, and un-revealing asks first. Taking a
 * container back out of sight after players have seen its contents does not
 * unsee them — it just makes the app disagree with what the table remembers,
 * so it should be a deliberate act rather than a mis-click on the same button.
 */
export function RevealToggle({
  containerId,
  revealed,
}: {
  containerId: string;
  revealed: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const set = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setContainerRevealedAction(containerId, next);
      if (!result.ok) {
        setError(result.error ?? "Could not change that.");
        setConfirming(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  };

  if (error) {
    return (
      <span role="alert" className="text-sm text-danger">
        {error}
      </span>
    );
  }

  if (!revealed) {
    return (
      <button
        type="button"
        onClick={() => set(true)}
        disabled={pending}
        /* Warning tone, not a second primary fill. Design.md gives one fill per
           screen to the primary action, which here is "Add item" — and this
           button pairs visually with the "Hidden" chip beside the title, so the
           state and the way to change it read as one thing. */
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-warning bg-warning-weak px-2.5 text-sm font-bold text-warning hover:bg-warning hover:text-invert disabled:opacity-60"
      >
        <Icon name="check" size={13} />
        {pending ? "Revealing…" : "Reveal to players"}
      </button>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        title="Players can currently see this container"
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-muted hover:text-text disabled:opacity-60"
      >
        <Icon name="check" size={13} className="text-success" />
        Revealed
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="text-sm text-muted">Hide it again?</span>
      <button
        type="button"
        onClick={() => set(false)}
        disabled={pending}
        className="h-8 rounded-md border border-danger bg-danger-weak px-2.5 text-sm font-bold text-danger disabled:opacity-60"
      >
        {pending ? "Hiding…" : "Hide"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="h-8 rounded-md px-2 text-sm text-muted hover:text-text"
      >
        Cancel
      </button>
    </span>
  );
}
