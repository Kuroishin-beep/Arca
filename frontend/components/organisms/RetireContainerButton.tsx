"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { archiveContainerAction } from "@backend/actions/containers";
import { Button } from "@frontend/components/atoms/Button";

/**
 * Retire a container — GM only.
 *
 * The repository refuses a container that still holds items, so the dangerous
 * case is already impossible; this confirmation exists to stop a mis-click, not
 * to guard against loss. Same reasoning as ArchiveItemButton, and the same
 * shape: one extra click, inline, rather than a second dialog stacked on this
 * one.
 *
 * On success it navigates to another container rather than refreshing in
 * place — staying on a page whose subject no longer exists renders the
 * "Sealed" screen, which reads as a permission error rather than as success.
 */
export function RetireContainerButton({
  containerId,
  containerName,
  fallbackHref,
}: {
  containerId: string;
  containerName: string;
  /** Where to land afterwards; the container being retired is gone. */
  fallbackHref: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const retire = () => {
    setError(null);
    startTransition(async () => {
      const result = await archiveContainerAction(containerId);
      if (!result.ok) {
        // Most often "still holds N items", which is guidance rather than a
        // failure — so it stays on screen and the dialog stays open.
        setError(result.error ?? "Could not retire that container.");
        setConfirming(false);
        return;
      }
      router.push(fallbackHref);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-text">Retire this container</p>
          <p className="text-sm text-muted">
            It stops appearing for everyone. Nothing is deleted, and it must be
            empty first.
          </p>
        </div>

        {confirming ? (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={retire}
            >
              {pending ? "Retiring…" : "Confirm"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="danger"
            size="sm"
            className="shrink-0"
            onClick={() => setConfirming(true)}
            aria-label={`Retire ${containerName}`}
          >
            Retire
          </Button>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
