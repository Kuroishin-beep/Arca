"use client";

import { useEffect, useState } from "react";

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
 */
type Theme = "light" | "dark";

const STORAGE_KEY = "arca-theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  /**
   * `null` means "no explicit choice yet — following the system". It is a real
   * third state, not a loading placeholder: rendering a fixed guess on the
   * server and a different value after hydration is what makes theme toggles
   * flicker, so the button renders neutrally until it knows.
   */
  const [theme, setTheme] = useState<Theme | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") {
        setTheme(saved);
        document.documentElement.dataset.theme = saved;
      }
    } catch {
      // Private mode, or the Symbiote's embedded browser restricting storage
      // (SCOPE.md §4.1). The toggle still works for this session; it just will
      // not be remembered, which is the right way to degrade.
    }
  }, []);

  /** What the button will switch TO. Before a choice exists, ask the system. */
  const resolved: Theme =
    theme ??
    (mounted &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
  const next: Theme = resolved === "dark" ? "light" : "dark";

  const apply = () => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // See above — a session-only theme is still a working theme.
    }
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
