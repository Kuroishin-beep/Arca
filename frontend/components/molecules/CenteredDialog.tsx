"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

/**
 * A card in the middle of the screen over a dimmed page — the item detail's
 * frame. It used to be a column pinned beside the table, which in TaleSpire's
 * narrow side panel left both too squeezed to read. Escape, or a click on
 * the dim, goes to `closeHref` (the same address without the open item).
 */
export function CenteredDialog({
  label,
  closeHref,
  children,
}: {
  label: string;
  closeHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, closeHref]);

  return (
    <div className="fixed inset-0 z-20 grid place-items-center p-4">
      <button
        type="button"
        aria-label={`Close ${label.toLowerCase()}`}
        onClick={() => router.push(closeHref, { scroll: false })}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-xl"
      >
        {children}
      </aside>
    </div>
  );
}
