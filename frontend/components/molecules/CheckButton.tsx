"use client";

import { useEffect, useRef, useState } from "react";

import { type CheckResult, type Edge, diceFor, resolveCheck, rollD20s } from "@backend/domain/checks";
import { isSymbiote, rollD20sInTaleSpire } from "@backend/lib/talespire";
import { Icon } from "@frontend/components/atoms/Icon";

export interface RolledCheck {
  /** What was rolled, e.g. "Bushcraft". */
  name: string;
  result: CheckResult;
  /** Why the roll had banes — one die each. Empty for a boon or a plain roll. */
  banes: string[];
}

const EDGES: { edge: Edge; label: string; hint: string }[] = [
  { edge: "boon", label: "Boon", hint: "two d20, best counts" },
  { edge: "normal", label: "Normal", hint: "one d20" },
  { edge: "bane", label: "Bane", hint: "worst d20 counts" },
];

/**
 * A d20 that makes a Dragonbane check and reports how it went.
 *
 * Clicking it asks first: Boon, Normal or Bane. The answer Arca would give on
 * its own — a bane from the attribute's condition or from armour that lists
 * the skill — is pre-selected and says why, but the player (or the GM's
 * ruling) decides. Inside TaleSpire the dice go to the tray, are thrown there
 * for the table to see, and the result is read back; in a browser tab Arca
 * rolls them itself. Either way the caller gets the judged result.
 */
export function CheckButton({
  name,
  target,
  banes,
  onRolled,
  onUnread,
  className = "",
}: {
  name: string;
  target: number;
  /** Banes Arca found (conditions, armour) — the suggestion, not the rule. */
  banes: string[];
  onRolled: (rolled: RolledCheck) => void;
  /** TaleSpire did not report a result (refused, tray cleared, timed out). */
  onUnread: (name: string) => void;
  className?: string;
}) {
  const [rolling, setRolling] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const label = `${name} (${target})`;
  const suggested: Edge = banes.length > 0 ? "bane" : "normal";

  // Close on a click elsewhere or Escape — a menu that stays open over the
  // skill list is in the way of the next roll.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const roll = (edge: Edge) => {
    setOpen(false);
    if (rolling) return;
    setRolling(true);
    const count = diceFor(edge, banes.length);
    const dice: Promise<number[] | null> = isSymbiote()
      ? rollD20sInTaleSpire(count, label)
      : Promise.resolve(rollD20s(count));
    void dice.then((values) => {
      setRolling(false);
      if (values === null) onUnread(name);
      else {
        onRolled({
          name,
          result: resolveCheck(target, values, edge),
          banes: edge === "bane" ? (banes.length > 0 ? banes : ["Bane"]) : [],
        });
      }
    });
  };

  const title = `Roll ${label}${banes.length > 0 ? ` — suggested bane: ${banes.join(", ")}` : ""}`;

  return (
    <span ref={box} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={title}
        title={title}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((on) => !on)}
        aria-busy={rolling}
        className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-sm hover:bg-surface3 focus-visible:outline-2 focus-visible:outline-primary ${
          rolling || open ? "text-primary" : banes.length > 0 ? "text-warning" : "text-muted hover:text-primary"
        }`}
      >
        <Icon name="d20" size={14} />
        {banes.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
        ) : null}
      </button>
      {open ? (
        <span
          role="group"
          aria-label={`How to roll ${name}`}
          className="absolute right-0 top-7 z-30 flex w-52 flex-col gap-1 rounded-md border border-border-strong bg-surface p-2 shadow-lg"
        >
          <span className="px-1 text-xs text-muted">{label}</span>
          {EDGES.map(({ edge, label: edgeLabel, hint }) => {
            const isSuggested = edge === suggested;
            return (
              <button
                key={edge}
                type="button"
                onClick={() => roll(edge)}
                autoFocus={isSuggested}
                className={`flex flex-col items-start rounded-sm px-2 py-1 text-left hover:bg-surface2 ${
                  isSuggested ? "border border-primary" : "border border-transparent"
                }`}
              >
                <span className="text-sm font-medium text-text">
                  {edgeLabel}
                  {isSuggested && edge === "bane" ? `: ${banes.join(", ")}` : ""}
                </span>
                <span className="text-xs text-faint">
                  {edge === "bane" && banes.length > 1 ? `${banes.length + 1} d20, worst counts` : hint}
                  {isSuggested ? " · suggested" : ""}
                </span>
              </button>
            );
          })}
        </span>
      ) : null}
    </span>
  );
}

/** The result of the last check, floating over the sheet until dismissed. */
export function CheckToast({
  rolled,
  unread,
  autoMarked,
  onClose,
}: {
  rolled: RolledCheck | null;
  unread: string | null;
  autoMarked: boolean;
  onClose: () => void;
}) {
  if (!rolled && !unread) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-40 flex max-w-sm items-start gap-3 rounded-md border border-border-strong bg-surface p-3 shadow-lg"
    >
      {rolled ? <ResultBody rolled={rolled} autoMarked={autoMarked} /> : null}
      {!rolled && unread ? (
        <p className="text-sm text-text">
          No result came back for <strong>{unread}</strong> — the roll was cleared, refused
          (are you on a board?), or not thrown in time.
        </p>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss roll result"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-muted hover:bg-surface2 hover:text-text"
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

function ResultBody({ rolled, autoMarked }: { rolled: RolledCheck; autoMarked: boolean }) {
  const { result, banes, name } = rolled;
  const verdict = result.dragon ? "Dragon!" : result.demon ? "Demon!" : result.success ? "Success" : "Failure";
  const tone = result.success ? "text-success" : "text-danger";
  return (
    <div className="min-w-0 flex-1">
      <p className="text-sm text-muted">{name}</p>
      <p className="flex items-baseline gap-2">
        <span className={`font-serif text-xl font-bold ${tone}`}>{verdict}</span>
        <span className="font-mono text-sm text-text">
          rolled {result.kept} vs {result.target}
        </span>
      </p>
      {result.edge === "bane" ? (
        <p className="text-xs text-muted">
          Bane{banes.length > 1 ? "s" : ""} ({banes.join(", ")}): dice {result.dice.join(", ")}, worst kept
        </p>
      ) : null}
      {result.edge === "boon" ? (
        <p className="text-xs text-muted">
          Boon: dice {result.dice.join(", ")}, best kept
        </p>
      ) : null}
      {autoMarked ? (
        <p className="text-xs text-primary">Marked for advancement.</p>
      ) : null}
    </div>
  );
}
