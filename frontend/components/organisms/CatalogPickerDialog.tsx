"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { addFromCatalogAction } from "@backend/actions/catalog";
import type { CatalogItemView, ContainerView } from "@backend/domain/view";
import { Button } from "@frontend/components/atoms/Button";
import { Chip } from "@frontend/components/atoms/Chip";
import { Icon } from "@frontend/components/atoms/Icon";
import { NumberStepper } from "@frontend/components/atoms/NumberStepper";
import { Modal } from "@frontend/components/molecules/Modal";
import { StatChips } from "@frontend/components/molecules/StatFields";

/**
 * Taking a copy out of the catalogue — SCOPE.md S3, the player's half.
 *
 * The flow this exists for is "I am looking at my pack and I want a rope".
 * Sending someone to a catalogue screen to pick a destination would invert
 * that: the container is already known, so the only question left is WHICH
 * entry and HOW MANY.
 *
 * What lands is a copy that reads its name, weight, value and tags from the
 * entry rather than holding its own. The dialog says so, because otherwise
 * the first surprise is a GM correcting a weight and six packs changing.
 */
export function CatalogPickerDialog({
  container,
  entries,
  closeHref,
}: {
  container: ContainerView;
  entries: CatalogItemView[];
  closeHref: string;
}) {
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return entries;
    return entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(q) ||
        entry.tags.some((t) => t.toLowerCase().includes(q)) ||
        entry.types.some((t) => t.toLowerCase().includes(q)),
    );
  }, [entries, query]);

  const take = (entry: CatalogItemView) => {
    setError(null);
    setPendingId(entry.id);

    startTransition(async () => {
      const form = new FormData();
      form.set("catalogItemId", entry.id);
      form.set("containerId", container.id);
      form.set("qty", String(qty[entry.id] ?? 1));

      const result = await addFromCatalogAction(form);
      setPendingId(null);

      if (!result.ok) {
        setError(result.error ?? "Could not add that.");
        return;
      }
      // Straight back to the container, where the new row is. Staying open
      // would invite a second click that adds a second copy nobody wanted.
      router.push(closeHref);
    });
  };

  return (
    <Modal
      title="Add from the catalogue"
      closeHref={closeHref}
      footer={
        <p className="text-sm text-muted">
          A copy reads its name, weight and value from the catalogue, so a
          correction there reaches it. Its quantity and notes are its own.
        </p>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-muted">
          into <span className="font-medium text-text">{container.name}</span>
        </p>

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-danger bg-danger-weak p-3 text-base text-text"
          >
            <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-danger" />
            <span>{error}</span>
          </p>
        ) : null}

        {/* Pinned to the top of the Modal's scroll region, so the search is
            still in reach after scrolling down a long catalogue. The list has
            no scroll region of its own any more — a second one nested inside
            the Modal's was what produced two scrollbars. */}
        <div className="sticky top-0 z-10 -mx-4 -mt-3 bg-surface px-4 pb-2 pt-3">
          <label htmlFor="catalog-search" className="sr-only">
            Search the catalogue
          </label>
          <input
            id="catalog-search"
            type="search"
            value={query}
            autoFocus
            placeholder="Search the catalogue…"
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-surface2 px-2 text-base text-text placeholder:text-faint"
          />
        </div>

        {entries.length === 0 ? (
          <p className="rounded-md border border-border bg-surface2 p-4 text-base text-muted">
            The catalogue is empty. Only the GM can add to it — ask them to
            define something, then it is one click from here.
          </p>
        ) : matches.length === 0 ? (
          <p className="p-2 text-base text-muted">
            Nothing in the catalogue matches “{query.trim()}”.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {matches.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface2 p-2"
              >
                {/* `basis-full` puts the name on a line of its own. Sharing a
                    row with a 128px stepper and the Add button left it about
                    110px inside the dialog, and "Healing Pot…" is not a name
                    anyone can pick from — the one thing on this row a person
                    actually reads was the thing being cut. */}
                <div className="min-w-0 basis-full">
                  <p className="text-base text-text">{entry.name}</p>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-faint">
                    <span className="font-mono tabular-nums">
                      {entry.weight.toFixed(1)} kg
                    </span>
                    {entry.value ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{entry.value}</span>
                      </>
                    ) : null}
                    {entry.tags.map((tag) => (
                      <Chip key={tag}>{tag}</Chip>
                    ))}
                    <StatChips types={entry.types} stats={entry.stats} />
                  </p>
                </div>

                <label htmlFor={`catalog-qty-${entry.id}`} className="sr-only">
                  Quantity of {entry.name}
                </label>
                <NumberStepper
                  id={`catalog-qty-${entry.id}`}
                  label={`quantity of ${entry.name}`}
                  value={qty[entry.id] ?? 1}
                  min={1}
                  onChange={(value) =>
                    setQty((all) => ({ ...all, [entry.id]: value }))
                  }
                />

                <Button
                  size="sm"
                  variant="primary"
                  icon="plus"
                  className="ml-auto"
                  disabled={pending}
                  onClick={() => take(entry)}
                >
                  {pendingId === entry.id ? "Adding…" : "Add"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
