"use client";

import { useSyncExternalStore } from "react";

import { Icon } from "@frontend/components/atoms/Icon";

/**
 * Light / dark switch.
 *
 * It writes ONE attribute — `data-theme` on `<html>` — and every colour in the
 * app follows, because the palette is CSS custom properties and Tailwind's
 * theme maps to them with `@theme inline`. No component is theme-aware and
 * none needs a `dark:` class.
 *
 * The default is deliberately NOT set here. `prefers-color-scheme` in
 * globals.css already gives a correct first paint with no JavaScript, so this
 * button exists only to override the system — which is why nothing runs before
 * hydration and there is no blocking script in the document head.
 *
 * The current theme is read with `useSyncExternalStore` rather than an effect.
 * Two things outside React decide it — `localStorage` and the OS preference —
 * and this is the hook built for reading exactly that: `getServerSnapshot`
 * answers during SSR, the client snapshot takes over after hydration, and
 * there is no cascading setState to learn something the browser already knew.
 */
type Theme = "light" | "dark";

const STORAGE_KEY = "arca-theme";
/** Lets one toggle's click re-run every subscriber's snapshot in this tab;
 *  `storage` only fires in OTHER tabs. */
const CHANGED = "arca-theme-changed";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function readTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Private mode, or the Symbiote's embedded browser restricting storage
    // (SCOPE.md §4.1). Fall through to the system preference — a theme that is
    // not remembered still beats a theme that throws.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** The server cannot know either input, and neither can the first hydration
 *  pass. It must be a stable value or React re-renders forever. */
function serverTheme(): Theme {
  return "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const resolved = useSyncExternalStore(subscribe, readTheme, serverTheme);
  const next: Theme = resolved === "dark" ? "light" : "dark";

  const apply = () => {
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Session-only theme. Still a working theme.
    }
    window.dispatchEvent(new Event(CHANGED));
  };

  return (
    <button
      type="button"
      onClick={apply}
      // Not `aria-pressed`: this is not a control that is on or off, it is one
      // that switches between two named states. The label says which.
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-surface text-muted hover:bg-surface2 hover:text-text ${className}`}
    >
      {/* The glyph shows what you would switch TO, which is the convention
          people already read correctly on this control. */}
      <Icon name={next === "dark" ? "moon" : "sun"} size={15} />
    </button>
  );
}
