"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { Icon } from "@frontend/components/atoms/Icon";
import { LATEST_CHANGE } from "@frontend/constants/changelog";

const STORAGE_KEY = "arca:changelog-dismissed";

/** The id of the entry this browser last dismissed, or null. Read on the
 *  client only; storage can be missing or blocked, which reads as "never". */
function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
const noSubscription = () => () => {};

/**
 * The strip along the top of the app announcing the newest change.
 *
 * Closing it is remembered per entry, in this browser: a new entry in
 * `frontend/constants/changelog.ts` brings it back for everyone. Nothing is
 * rendered on the server — whether it was dismissed is only known in the
 * browser — so it appears just after load rather than flashing for people who
 * already closed it.
 */
export function ChangelogBanner() {
  const latest = LATEST_CHANGE;
  const dismissedOnLoad = useSyncExternalStore(noSubscription, readDismissed, () => latest?.id ?? null);
  const [closed, setClosed] = useState(false);

  if (!latest || closed || dismissedOnLoad === latest.id) return null;

  const dismiss = () => {
    setClosed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, latest.id);
    } catch {
      // Storage blocked: it closes for this page view and returns next load.
    }
  };

  return (
    <div
      role="region"
      aria-label="What's new"
      className="flex shrink-0 items-center gap-2 border-b border-primary bg-primary-weak px-3 py-1 text-sm text-text md:px-4"
    >
      <Icon name="info" size={14} className="shrink-0 text-primary" />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-semibold">New:</span> {latest.title}
      </p>
      <Link
        href="/changelog"
        className="shrink-0 font-medium text-primary underline-offset-4 hover:underline"
      >
        See what changed
      </Link>
      {/* Not IconButton: that is the 32px toolbar control, and it made this
          strip as tall as the top bar. */}
      <button
        type="button"
        aria-label="Dismiss what's new"
        title="Dismiss"
        onClick={dismiss}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-muted hover:bg-surface2 hover:text-text"
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
