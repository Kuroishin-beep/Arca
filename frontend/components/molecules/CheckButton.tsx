"use client";

import { useEffect, useRef, useState } from "react";

import {
  type CheckResult,
  MODIFIERS,
  type Modifier,
  diceForModifier,
  edgeOf,
  resolveCheck,
  rollD20s,
  suggestedModifier,
} from "@backend/domain/checks";
import { isSymbiote, rollD20sInTaleSpire } from "@backend/lib/talespire";
import { Icon } from "@frontend/components/atoms/Icon";

export interface RolledCheck {
  /** What was rolled, e.g. "Bushcraft". */
  name: string;
  result: CheckResult;
  /** The net modifier it was rolled at: banes below 0, boons above. */
  modifier: number;
  /** Why Arca suggested banes (conditions, armour) — shown with a bane roll. */
  banes: string[];
}

/** A check whose dice went to TaleSpire but whose result never came back. */
export interface UnreadCheck {
  name: string;
  target: number;
  modifier: number;
  banes: string[];
  /** The skill, when it is a skill check — so a typed-in Dragon still marks it. */
  skill?: string;
}

/** How the scale labels a step: `-3 -2 -1 1 +1 +2 +3`, the middle one being
 *  a single plain d20. */
function stepLabel(m: number): string {
  return m === 0 ? "1" : m > 0 ? `+${m}` : `${m}`;
}

function stepMeaning(m: number): string {
  if (m === 0) return "Normal: one d20";
  const n = Math.abs(m);
  const kind = m > 0 ? "boon" : "bane";
  return `${n} ${kind}${n > 1 ? "s" : ""}: ${diceForModifier(m)} d20, ${m > 0 ? "best" : "worst"} counts`;
}

/**
 * A d20 that makes a Dragonbane check and reports how it went.
 *
 * Clicking it opens a scale from three banes to three boons —
 * `-3 -2 -1 1 +1 +2 +3` — and one click on a step rolls. The step Arca would
 * pick on its own (a bane per condition or armour that applies) is outlined
 * and says why; the player, or the GM's ruling, decides. Inside TaleSpire the
 * dice go to the tray and the result is read back; in a browser Arca rolls.
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
  onUnread: (check: UnreadCheck) => void;
  className?: string;
}) {
  const [rolling, setRolling] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const label = `${name} (${target})`;
  const suggested: Modifier = suggestedModifier(banes);

  // Close on a click elsewhere or Escape — an open scale over the skill list
  // is in the way of the next roll.
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

  const roll = (modifier: number) => {
    setOpen(false);
    if (rolling) return;
    setRolling(true);
    const count = diceForModifier(modifier);
    const dice: Promise<number[] | null> = isSymbiote()
      ? rollD20sInTaleSpire(count, label)
      : Promise.resolve(rollD20s(count));
    void dice.then((values) => {
      setRolling(false);
      if (values === null) onUnread({ name, target, modifier, banes });
      else {
        onRolled({
          name,
          result: resolveCheck(target, values, edgeOf(modifier)),
          modifier,
          banes: modifier < 0 ? banes : [],
        });
      }
    });
  };

  const title = `Roll ${label}${banes.length > 0 ? ` — suggested ${stepLabel(suggested)}: ${banes.join(", ")}` : ""}`;

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
          className="absolute right-0 top-7 z-30 flex w-64 flex-col gap-2 rounded-md border border-border-strong bg-surface p-2 shadow-lg"
        >
          <span className="flex items-baseline justify-between px-1 text-xs text-muted">
            <span>{label}</span>
            <span>banes · boons</span>
          </span>
          <span className="grid grid-cols-7 overflow-hidden rounded-sm border border-border">
            {MODIFIERS.map((m) => {
              const isSuggested = m === suggested;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => roll(m)}
                  autoFocus={isSuggested}
                  aria-label={`${stepMeaning(m)}${isSuggested ? " (suggested)" : ""}`}
                  title={stepMeaning(m)}
                  className={`h-9 border-r border-border font-mono text-sm last:border-r-0 hover:bg-surface2 ${
                    isSuggested ? "bg-primary text-invert font-bold hover:bg-primary-hover" : ""
                  } ${m < 0 && !isSuggested ? "text-danger" : ""} ${m > 0 && !isSuggested ? "text-success" : ""} ${
                    m === 0 && !isSuggested ? "text-text" : ""
                  }`}
                >
                  {stepLabel(m)}
                </button>
              );
            })}
          </span>
          <span className="px-1 text-xs text-faint">
            {suggested < 0
              ? `Suggested ${stepLabel(suggested)}: ${banes.join(", ")}`
              : "Tap a step to roll. Banes left, boons right."}
          </span>
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
  onManual,
  onClose,
}: {
  rolled: RolledCheck | null;
  unread: UnreadCheck | null;
  autoMarked: boolean;
  /** The player typed in what the dice showed for an unread roll. */
  onManual: (rolled: RolledCheck, skill?: string) => void;
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
      {!rolled && unread ? <ManualEntry unread={unread} onManual={onManual} /> : null}
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

/**
 * The fallback when TaleSpire's result never arrives (an older Symbiote,
 * a cleared tray, a timeout): type what the dice showed and Arca still judges
 * the check — Dragons and Demons still mark the skill.
 */
function ManualEntry({
  unread,
  onManual,
}: {
  unread: UnreadCheck;
  onManual: (rolled: RolledCheck, skill?: string) => void;
}) {
  const count = diceForModifier(unread.modifier);
  const [values, setValues] = useState<string[]>(() => Array.from({ length: count }, () => ""));
  const dice = values.map((v) => Number(v));
  const valid = dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 20);

  return (
    <form
      className="min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onManual(
          {
            name: unread.name,
            result: resolveCheck(unread.target, dice, edgeOf(unread.modifier)),
            modifier: unread.modifier,
            banes: unread.modifier < 0 ? unread.banes : [],
          },
          unread.skill,
        );
      }}
    >
      <p className="text-sm text-text">
        No result came back for <strong>{unread.name}</strong>. Type what the{" "}
        {count > 1 ? `${count} d20 showed` : "d20 showed"}:
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {values.map((v, i) => (
          <input
            key={i}
            aria-label={`d20 ${i + 1} for ${unread.name}`}
            inputMode="numeric"
            value={v}
            onChange={(e) =>
              setValues((all) => all.map((old, j) => (j === i ? e.target.value.replace(/\D/g, "").slice(0, 2) : old)))
            }
            className="h-8 w-12 rounded-sm border border-border bg-surface2 text-center font-mono text-base text-text"
          />
        ))}
        <button
          type="submit"
          disabled={!valid}
          className="h-8 rounded-sm bg-primary px-3 text-sm font-bold text-invert disabled:bg-surface3 disabled:text-faint"
        >
          Judge
        </button>
      </div>
      <p className="mt-1 text-xs text-faint">
        Results not coming back at all? Reinstall the Arca Symbiote (1.1 or newer).
      </p>
    </form>
  );
}

function ResultBody({ rolled, autoMarked }: { rolled: RolledCheck; autoMarked: boolean }) {
  const { result, banes, name, modifier } = rolled;
  const verdict = result.dragon ? "Dragon!" : result.demon ? "Demon!" : result.success ? "Success" : "Failure";
  const tone = result.success ? "text-success" : "text-danger";
  const n = Math.abs(modifier);
  return (
    <div className="min-w-0 flex-1">
      <p className="text-sm text-muted">{name}</p>
      <p className="flex items-baseline gap-2">
        <span className={`font-serif text-xl font-bold ${tone}`}>{verdict}</span>
        <span className="font-mono text-sm text-text">
          rolled {result.kept} vs {result.target}
        </span>
      </p>
      {modifier < 0 ? (
        <p className="text-xs text-muted">
          {n} bane{n > 1 ? "s" : ""}
          {banes.length > 0 ? ` (${banes.join(", ")})` : ""}: dice {result.dice.join(", ")}, worst kept
        </p>
      ) : null}
      {modifier > 0 ? (
        <p className="text-xs text-muted">
          {n} boon{n > 1 ? "s" : ""}: dice {result.dice.join(", ")}, best kept
        </p>
      ) : null}
      {autoMarked ? <p className="text-xs text-primary">Marked for advancement.</p> : null}
    </div>
  );
}
