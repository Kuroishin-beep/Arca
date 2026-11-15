"use client";

import { useState } from "react";

import { type CheckResult, resolveCheck, rollD20s } from "@backend/domain/checks";
import { isSymbiote, rollD20sInTaleSpire } from "@backend/lib/talespire";
import { Icon } from "@frontend/components/atoms/Icon";

export interface RolledCheck {
  /** What was rolled, e.g. "Bushcraft". */
  name: string;
  result: CheckResult;
  /** Why the roll had banes — one die each. */
  banes: string[];
}

/**
 * A d20 that makes a Dragonbane check and reports how it went.
 *
 * Inside TaleSpire the dice go to the tray, are thrown there for the table to
 * see, and the result is read back. In a browser tab Arca rolls them itself.
 * Either way the caller gets the judged result — success, Dragon, Demon —
 * with every bane already applied, so nobody counts dice by hand.
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
  banes: string[];
  onRolled: (rolled: RolledCheck) => void;
  /** TaleSpire did not report a result (refused, tray cleared, timed out). */
  onUnread: (name: string) => void;
  className?: string;
}) {
  const [rolling, setRolling] = useState(false);
  const label = `${name} (${target})`;
  const title = `Roll ${label}${banes.length > 0 ? ` with ${banes.length} bane${banes.length > 1 ? "s" : ""}: ${banes.join(", ")}` : ""}`;

  const roll = () => {
    if (rolling) return;
    setRolling(true);
    const count = 1 + banes.length;
    const dice: Promise<number[] | null> = isSymbiote()
      ? rollD20sInTaleSpire(count, label)
      : Promise.resolve(rollD20s(count));
    void dice.then((values) => {
      setRolling(false);
      if (values === null) onUnread(name);
      else onRolled({ name, result: resolveCheck(target, values), banes });
    });
  };

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={roll}
      aria-busy={rolling}
      className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-sm hover:bg-surface3 focus-visible:outline-2 focus-visible:outline-primary ${
        rolling ? "text-primary" : banes.length > 0 ? "text-warning" : "text-muted hover:text-primary"
      } ${className}`}
    >
      <Icon name="d20" size={14} />
      {banes.length > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
      ) : null}
    </button>
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
      {banes.length > 0 ? (
        <p className="text-xs text-muted">
          Bane{banes.length > 1 ? "s" : ""} ({banes.join(", ")}): dice {result.dice.join(", ")}, worst kept
        </p>
      ) : null}
      {autoMarked ? (
        <p className="text-xs text-primary">Marked for advancement.</p>
      ) : null}
    </div>
  );
}
