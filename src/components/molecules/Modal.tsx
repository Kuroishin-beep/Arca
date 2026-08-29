"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Icon } from "@/components/atoms/Icon";

/**
 * The dialog shell.
 *
 * Uses the native `<dialog>` element, which gives focus trapping, `Esc`, and
 * the top layer for free — all of the parts that are tedious to hand-roll and
 * embarrassing to get wrong. `showModal()` is called from an effect because the
 * element must be in the DOM first.
 *
 * Below `panel` it is a bottom sheet with 44px targets; above it, a centred
 * card. Same markup, one breakpoint.
 */
export function Modal({
  title,
  subtitle,
  closeHref,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Where `Esc`, the backdrop, and the close button go. A URL rather than a
   *  callback so the dialog is a real navigable state. */
  closeHref: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // The server already rendered this with the `open` attribute (see below),
    // which makes it a NON-modal dialog: visible, but with no backdrop, no
    // focus trap and no top layer. Upgrade it to a real modal once JS is here.
    // `showModal()` throws on an already-open dialog, so it has to be closed
    // first, and `:modal` is the only reliable way to tell the two states
    // apart — `.open` is true for both.
    if (dialog.matches(":modal")) return;
    dialog.close();
    dialog.showModal();
  }, []);

  const close = () => router.push(closeHref);

  return (
    <dialog
      ref={ref}
      // Rendered open by the SERVER, not by an effect. Which dialog is showing
      // is URL state, so the server already knows the answer — and opening it
      // only from `useEffect` would mean the move dialog is invisible whenever
      // hydration is slow or fails. For the app's headline flow that is not an
      // acceptable failure mode: a chunk that 404s would silently make the
      // feature unreachable rather than merely degraded.
      open
      aria-labelledby="modal-title"
      onCancel={(event) => {
        // Esc: navigate rather than letting the browser just hide the element,
        // otherwise the URL would still say a dialog is open.
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        // Backdrop clicks land on the dialog element itself.
        if (event.target === ref.current) close();
      }}
      className="m-0 max-h-full w-full max-w-none bg-transparent p-0 backdrop:bg-black/60 panel:m-auto panel:max-w-md panel:p-4"
      style={{ inset: 0 }}
    >
      <div className="flex min-h-full flex-col justify-end panel:min-h-0 panel:justify-center">
        <div className="rounded-t-lg border-t border-border bg-surface panel:rounded-lg panel:border panel:shadow-modal">
          <div className="flex items-start gap-3 border-b border-border p-4">
            <div className="min-w-0 flex-1">
              <h2
                id="modal-title"
                className="font-serif text-lg font-bold text-text panel:text-xl"
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1 truncate text-base text-muted">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={close}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted hover:bg-surface2 hover:text-text"
            >
              <Icon name="close" size={14} />
              <span className="sr-only">Close</span>
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">{children}</div>

          {footer ? (
            <div className="flex items-center gap-2 border-t border-border p-4">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
