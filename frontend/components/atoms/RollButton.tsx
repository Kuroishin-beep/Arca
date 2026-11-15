"use client";

import { useState, useSyncExternalStore } from "react";

import { Icon } from "@frontend/components/atoms/Icon";
import { TS_READY_EVENT, isSymbiote, rollDice } from "@backend/lib/talespire";

/**
 * Whether TaleSpire's API is on this page. `false` on the server and during
 * hydration (the server cannot know), then the client answer — and it is
 * re-read when the bridge announces TaleSpire has finished initialising.
 */
const subscribe = (onChange: () => void) => {
  window.addEventListener(TS_READY_EVENT, onChange);
  return () => window.removeEventListener(TS_READY_EVENT, onChange);
};
export function useSymbiote(): boolean {
  return useSyncExternalStore(subscribe, isSymbiote, () => false);
}

type Status = "idle" | "sent" | "refused";

/**
 * A die that puts a roll in TaleSpire's tray.
 *
 * Renders NOTHING outside TaleSpire: in a browser tab there is no tray to put
 * dice in, and a button that can only ever fail is worse than no button. The
 * sheet still shows the number to roll under, so the table loses nothing.
 */
export function RollButton({
  notation,
  label,
  className = "",
}: {
  /** "1d20", "2D6" — normalised for the tray by `rollDice`. */
  notation: string;
  /** What the tray shows, e.g. "Bushcraft (12)". Also the button's name. */
  label: string;
  className?: string;
}) {
  const connected = useSymbiote();
  const [status, setStatus] = useState<Status>("idle");
  if (!connected) return null;

  const title =
    status === "refused"
      ? `TaleSpire refused that roll — are you on a board? (${label})`
      : `Roll ${notation} for ${label}`;

  // Not `IconButton`: that is the 32px toolbar control, and thirty of them
  // down a skill list doubled every row's height. This die sits inline with
  // the number it rolls against, the way a die is drawn on the printed sheet.
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={() => {
        void rollDice(notation, label).then((delivered) =>
          setStatus(delivered ? "sent" : "refused"),
        );
      }}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-sm hover:bg-surface3 focus-visible:outline-2 focus-visible:outline-primary ${
        status === "refused" ? "text-danger" : "text-muted hover:text-primary"
      } ${className}`}
    >
      <Icon name="d20" size={14} />
    </button>
  );
}
