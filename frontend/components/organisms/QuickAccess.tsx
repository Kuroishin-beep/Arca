"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";

import { Icon } from "@frontend/components/atoms/Icon";
import { IconButton } from "@frontend/components/atoms/IconButton";

/**
 * Quick Access — Wireframe.png, the strip above the content with a `+` on the
 * end.
 *
 * A short list of places you keep coming back to, pinned by hand. Not "recent":
 * a recency list reorders itself under you, and the whole value of this strip
 * is that the wagon is in the same spot every session.
 *
 * ## Why `localStorage` and not the URL or the database
 *
 * Every other piece of view state in Arca lives in the URL, deliberately — the
 * Symbiote's embedded browser reloads constantly, and a panel that forgets what
 * you were looking at is worse than no panel. This is the exception, and the
 * reason it is one is that it is not view state. It is durable, it is
 * per-person, and it must NOT travel: a URL is a thing you hand to someone at
 * the table, and pins that follow the link would rearrange their strip.
 *
 * Nor does it belong in the database. Two people at one table pin different
 * things, which would make it a per-user table, a migration and a write on
 * every pin — for a bookmark bar. `localStorage` is per-browser, which is the
 * same grain as "the machine I play on", and costs nothing.
 *
 * The trade is stated rather than hidden: pins do not follow you to another
 * device, and clearing site data clears them. For a bookmark bar that is the
 * right side of the trade.
 */
const KEY = "arca-quick-access";
const CHANGED = "arca-quick-access-changed";
const LIMIT = 8;

export interface QuickAccessEntry {
  href: string;
  label: string;
  /** Which section it came from, so the glyph matches the sidebar. */
  kind: "container" | "database";
}

/* ------------------------------------------------------------------ *
 * The store
 *
 * `useSyncExternalStore` rather than `useState` + an effect, and for the same
 * reason ThemeToggle uses it: the server cannot know this value, so the first
 * render must be a stable server snapshot and the real one must arrive without
 * a second paint that flashes the wrong strip.
 * ------------------------------------------------------------------ */

function read(): QuickAccessEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validated field by field rather than trusted: this string is editable by
    // anyone with devtools, and an entry with a missing `href` would render a
    // link to nowhere and a crash in `key`.
    return parsed
      .filter(
        (e): e is QuickAccessEntry =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as QuickAccessEntry).href === "string" &&
          typeof (e as QuickAccessEntry).label === "string" &&
          ((e as QuickAccessEntry).kind === "container" ||
            (e as QuickAccessEntry).kind === "database"),
      )
      .slice(0, LIMIT);
  } catch {
    // Private windows and "block site data" both throw on access rather than
    // returning null. An empty strip is the correct degraded state.
    return [];
  }
}

/**
 * `useSyncExternalStore` compares snapshots by identity, so returning a fresh
 * array from `read()` on every call would re-render forever. The parsed value
 * is cached against the raw string and only rebuilt when that string changes.
 */
let cachedRaw: string | null = null;
let cachedValue: QuickAccessEntry[] = [];

function snapshot(): QuickAccessEntry[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = read();
  }
  return cachedValue;
}

/** Stable, and empty: the server has no browser storage to read, and any other
 *  answer would make the first client render disagree with the HTML. */
const EMPTY: QuickAccessEntry[] = [];
function serverSnapshot(): QuickAccessEntry[] {
  return EMPTY;
}

function subscribe(onChange: () => void): () => void {
  // `storage` covers another tab; the custom event covers this one, which
  // `storage` deliberately does not fire for.
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function write(entries: QuickAccessEntry[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, LIMIT)));
  } catch {
    // Out of quota, or storage blocked. The pin is lost, which is a strictly
    // better outcome than an unhandled rejection on a click.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/* ------------------------------------------------------------------ *
 * The strip
 * ------------------------------------------------------------------ */

export function QuickAccess({
  current,
}: {
  /** What the `+` would pin — the page you are on. Absent on screens that are
   *  not a place, so the button does not offer to pin a dialog. */
  current?: QuickAccessEntry;
}) {
  const entries = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  const pinned = current
    ? entries.some((e) => e.href === current.href)
    : false;

  const toggle = useCallback(() => {
    if (!current) return;
    const without = entries.filter((e) => e.href !== current.href);
    // Unpinning is the same control, because a strip you can only add to fills
    // up and then needs a second, rarer control to empty — which is where a
    // pinned-items list usually goes wrong.
    write(pinned ? without : [...without, current]);
  }, [current, entries, pinned]);

  // Nothing pinned and nothing to pin: render nothing rather than an empty bar
  // with a lone `+`, which reads as a broken toolbar.
  if (entries.length === 0 && !current) return null;

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {entries.map((entry) => {
        const active = entry.href === current?.href;
        return (
          <Link
            key={entry.href}
            href={entry.href}
            aria-current={active ? "page" : undefined}
            className={[
              "flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs",
              active
                ? "border-primary bg-primary-weak font-medium text-primary"
                : "border-border bg-surface text-muted hover:bg-surface2 hover:text-text",
            ].join(" ")}
          >
            <Icon
              name={entry.kind === "database" ? "table" : "chest"}
              size={12}
            />
            <span className="max-w-[12ch] truncate">{entry.label}</span>
          </Link>
        );
      })}

      {entries.length > 0 && current ? (
        <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
      ) : null}

      {current ? (
        <IconButton
          onClick={toggle}
          icon={pinned ? "close" : "plus"}
          // The label names the target, because with several pinned chips
          // beside it "Pin" alone does not say which one is about to move.
          label={
            pinned
              ? `Unpin ${current.label} from quick access`
              : `Pin ${current.label} to quick access`
          }
          size={12}
          className="h-7 w-7"
        />
      ) : null}
    </div>
  );
}
