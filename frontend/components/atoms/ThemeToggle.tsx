"use client";

import { useSyncExternalStore } from "react";

import { IconButton } from "@frontend/components/atoms/IconButton";

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
  const media = window.matchMedia("(prefers-color-scheme: light)");
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
  // Mirrors globals.css exactly, which is the whole point: dark is the
  // default and light is the opt-in, so the question asked here has to be
  // "does this system ask for LIGHT?" and not "does it ask for dark?".
  //
  // The two are NOT complements. A system reporting `no-preference` matches
  // neither query, so asking the dark question would answer "light" while the
  // stylesheet painted dark — and the toggle would offer to switch you to the
  // theme you were already looking at.
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/** The server cannot know either input, and neither can the first hydration
 *  pass. It must be a stable value or React re-renders forever. */
function serverTheme(): Theme {
  return "dark";
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
    // The glyph shows what you would switch TO, which is the convention people
    // already read correctly on this control.
    //
    // Not `aria-pressed`: this is not a control that is on or off, it is one
    // that switches between two named states. The label says which.
    <IconButton
      onClick={apply}
      icon={next === "dark" ? "moon" : "sun"}
      label={`Switch to ${next} theme`}
      size={15}
      className={className}
    />
  );
}
