"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setContainerMembersAction } from "@backend/actions/containers";
import type { Member } from "@backend/db/repository";
import type { ContainerView } from "@backend/domain/view";
import { Button } from "@frontend/components/atoms/Button";
import { Icon } from "@frontend/components/atoms/Icon";

/**
 * The GM's half of Share, for a shared container: who is in it.
 *
 * Two modes rather than a list that is "everyone" when every box is ticked.
 * "Everyone at the table" also covers players who join the campaign later; a
 * full list of today's players does not, and the difference is invisible if
 * both look like a column of ticks.
 */
export function SharedMembersForm({
  container,
  players,
  closeHref,
}: {
  container: ContainerView;
  /** Players only — the GM is always in every container and is not listed. */
  players: Member[];
  closeHref: string;
}) {
  const [mode, setMode] = useState<"everyone" | "chosen">(
    container.memberIds === null ? "everyone" : "chosen",
  );
  const [chosen, setChosen] = useState<Set<string>>(
    new Set(container.memberIds ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = (userId: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const save = () => {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("containerId", container.id);
      form.set("mode", mode);
      for (const id of chosen) form.append("memberIds", id);
      const result = await setContainerMembersAction(form);
      if (!result.ok) {
        setError(result.error ?? "Could not change who is in that.");
        return;
      }
      router.push(closeHref);
    });
  };

  return (
    <section className="mt-4 rounded-md border border-border bg-surface2 p-3">
      <h3 className="mb-2 font-serif text-base font-bold text-text">
        Who is in {container.name}
      </h3>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Access</legend>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-text">
          <input
            type="radio"
            name="mode"
            value="everyone"
            checked={mode === "everyone"}
            onChange={() => setMode("everyone")}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-medium">Everyone at the table</span>
            <span className="block text-muted">
              Every player, including anyone who joins later.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-text">
          <input
            type="radio"
            name="mode"
            value="chosen"
            checked={mode === "chosen"}
            onChange={() => setMode("chosen")}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-medium">Only these players</span>
            <span className="block text-muted">
              Players you leave out cannot see it or change it. You always can.
            </span>
          </span>
        </label>
      </fieldset>

      {mode === "chosen" ? (
        <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
          {players.length === 0 ? (
            <li className="text-sm text-muted">No players at this table yet.</li>
          ) : (
            players.map((player) => (
              <li key={player.userId}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm text-text hover:bg-surface3">
                  <input
                    type="checkbox"
                    checked={chosen.has(player.userId)}
                    onChange={() => toggle(player.userId)}
                    aria-label={`${player.displayName} is in ${container.name}`}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 truncate">{player.displayName}</span>
                  <span className="truncate text-xs text-muted">{player.email}</span>
                </label>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-danger">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex justify-end">
        <Button variant="primary" size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}
