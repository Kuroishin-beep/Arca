"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * A `<details>` menu that closes the way menus do.
 *
 * The menus here are `<details>` so they open without JavaScript. On its own a
 * `<details>` only closes when its summary is clicked again — not on Escape,
 * not on a click elsewhere — which reads as a menu that is stuck open. This
 * adds both, and returns focus to the summary on Escape so the keyboard is
 * left where it was.
 */
export function MenuDetails({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => {
      if (ref.current?.open) ref.current.open = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !ref.current?.open) return;
      close();
      ref.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  );
}
