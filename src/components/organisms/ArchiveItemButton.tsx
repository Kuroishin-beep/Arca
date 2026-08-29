"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { archiveItemAction } from "@/actions/items";
import { Button } from "@/components/atoms/Button";
import { useOptimisticItems } from "@/components/organisms/OptimisticItems";

/**
 * Archive, with a confirmation step inline rather than a second dialog.
 *
 * Archiving is reversible — `archived_at` is set, nothing is deleted — so the
 * confirmation exists to stop a mis-tap, not to guard against loss. That is why
 * it is one extra click here rather than a modal with a typed confirmation.
 */
export function ArchiveItemButton({
  itemId,
  itemName,
}: {
  itemId: string;
  itemName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { remove } = useOptimisticItems();
  const router = useRouter();

  if (!confirming) {
    return (
      <Button
        variant="danger"
        size="sm"
        onClick={() => setConfirming(true)}
        aria-label={`Archive ${itemName}`}
      >
        Archive
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              // The whole stack goes; `Infinity` removes it whatever the
              // quantity, without this component needing to know it.
              remove({ itemId, qty: Number.POSITIVE_INFINITY });

              const result = await archiveItemAction(itemId);
              if (!result.ok) {
                setError(result.error ?? "Could not archive that.");
                setConfirming(false);
                return;
              }
              router.refresh();
            })
          }
        >
          {pending ? "Archiving…" : "Confirm"}
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
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
