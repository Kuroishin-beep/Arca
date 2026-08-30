"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { Button } from "@frontend/components/atoms/Button";
import { Icon } from "@frontend/components/atoms/Icon";
import { parseDiceNotation } from "@backend/lib/dice";
import { isSymbiote, rollDice } from "@backend/lib/talespire";

interface HistoryEntry {
  id: number;
  notation: string;
  at: Date;
  delivered: boolean;
}

const QUICK = ["d20", "2d6", "1d8+2", "4d6kh3", "d100"];

/**
 * Whether TaleSpire is on the other side of the glass.
 *
 * `isSymbiote()` reads `window`, so the server cannot answer it and the two
 * renders would disagree. `useSyncExternalStore` is the primitive built for
 * exactly that: `getServerSnapshot` answers "no" during SSR and hydration,
 * then the client snapshot takes over. Reading it in an effect and calling
 * setState would work too, but it is a cascading render to learn something
 * that never changes afterwards.
 */
const neverChanges = () => () => {};
const symbioteOnClient = () => isSymbiote();
const symbioteOnServer = () => false;

/**
 * The parse preview is the important part of this screen.
 *
 * At a real table an unintended roll cannot be taken back, so you see exactly
 * what will be thrown — term by term, in plain words, with the possible range —
 * before it is thrown. An error names the position it failed at rather than
 * shrugging with "invalid".
 */
export function DiceFinder() {
  const [notation, setNotation] = useState("2d6+3");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const connected = useSyncExternalStore(
    neverChanges,
    symbioteOnClient,
    symbioteOnServer,
  );

  const parsed = useMemo(() => parseDiceNotation(notation), [notation]);

  const throwDice = async () => {
    if (!parsed.ok) return;
    const delivered = await rollDice(parsed.normalised);
    setHistory((h) => [
      { id: h.length, notation: parsed.normalised, at: new Date(), delivered },
      ...h,
    ]);
  };

  return (
    <>
      <section>
        <label
          htmlFor="notation"
          className="mb-2 block font-serif text-lg font-bold text-text"
        >
          Roll
        </label>
        <div className="flex gap-2">
          <input
            id="notation"
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={notation}
            onChange={(e) => setNotation(e.target.value)}
            aria-invalid={parsed.ok ? undefined : true}
            aria-describedby="parse-preview"
            className={`h-11 min-w-0 flex-1 rounded-md border bg-surface2 px-3 font-mono text-lg tabular-nums text-text placeholder:text-faint ${
              parsed.ok ? "border-border" : "border-danger"
            }`}
          />
          <Button
            variant="primary"
            // `void`, not a bare async handler: an unhandled rejection from
            // the Symbiote bridge would otherwise vanish, and a roll that
            // never reached the table would look like nothing happened.
            onClick={() => void throwDice()}
            disabled={!parsed.ok || !connected}
            className="h-11 px-5 text-base"
            title={
              connected
                ? undefined
                : "Not connected to TaleSpire — open Arca as a Symbiote to roll."
            }
          >
            Throw
          </Button>
        </div>

        {parsed.ok ? (
          <div
            id="parse-preview"
            className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-3"
          >
            {parsed.terms.map((term, index) => (
              <span key={index} className="flex items-center gap-2">
                {index > 0 ? (
                  <span className="text-faint" aria-hidden="true">
                    {term.sign === -1 ? "−" : "+"}
                  </span>
                ) : null}
                <span className="rounded-sm border border-border bg-surface2 px-2 py-0.5 font-mono text-sm text-text">
                  {term.raw}
                </span>
                <span className="text-sm text-muted">{term.description}</span>
              </span>
            ))}
            <span className="ml-auto font-mono text-sm tabular-nums text-muted">
              range {parsed.min}–{parsed.max}
            </span>
          </div>
        ) : (
          <p
            id="parse-preview"
            role="alert"
            className="mt-2 flex items-start gap-2 rounded-md border border-danger bg-danger-weak p-3 text-sm text-text"
          >
            <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-danger" />
            <span>
              {parsed.message} Try{" "}
              <code className="font-mono text-primary">2d6+3</code>.
            </span>
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Button key={q} size="sm" onClick={() => setNotation(q)}>
              <span className="font-mono">{q}</span>
            </Button>
          ))}
        </div>

        {!connected ? (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-border bg-info-weak p-3 text-sm text-text">
            <Icon name="info" size={14} className="mt-0.5 shrink-0 text-info" />
            <span>
              Not connected to TaleSpire. Arca hands the roll to TaleSpire’s own
              roller so the dice land on the table where everyone can see them —
              so outside the Symbiote there is nothing to roll with, and Throw
              stays disabled rather than faking a result.
            </span>
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <h2 className="font-serif text-lg font-bold text-text">History</h2>
          <span className="ml-auto text-sm text-muted">This session</span>
        </div>
        {history.length === 0 ? (
          <p className="p-4 text-base text-muted">Nothing thrown yet.</p>
        ) : (
          <ul>
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary-weak">
                  <Icon name="check" size={14} className="text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base text-text">
                    <span className="font-mono">{entry.notation}</span>
                  </p>
                  <p className="truncate text-sm text-muted">
                    {entry.delivered
                      ? "Sent to TaleSpire’s roller"
                      : "Not delivered — no TaleSpire bridge"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-faint">
                  {entry.at.toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-border p-3 text-sm text-faint">
          Results are read back from TaleSpire. Arca does not roll its own dice.
        </p>
      </section>
    </>
  );
}
