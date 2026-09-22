"use client";

import { useState, useTransition } from "react";

import {
  archiveCatalogItemAction,
  createCatalogItemAction,
  updateCatalogItemAction,
} from "@backend/actions/catalog";
import type { CatalogItemView } from "@backend/domain/view";
import { Button } from "@frontend/components/atoms/Button";
import { Chip } from "@frontend/components/atoms/Chip";
import { TextAreaField, TextField } from "@frontend/components/atoms/Field";
import { StatChips, StatFields } from "@frontend/components/molecules/StatFields";
import { Icon } from "@frontend/components/atoms/Icon";

/**
 * The GM's half of the catalogue — SCOPE.md S3.
 *
 * One row per entry, expandable into the same form that creates one. Reusing
 * the form for both is the same argument `ItemEditorDialog` makes: add and
 * edit differ by which action receives the submit and whether the fields start
 * populated, and two forms would drift.
 *
 * The copy count is not decoration. It is the answer to "can I retire this?",
 * and the server refuses while it is above zero — so showing it here is the
 * difference between a refusal that makes sense and one that appears from
 * nowhere.
 */
export function CatalogManager({
  entries,
  canEdit,
}: {
  entries: CatalogItemView[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-6 flex flex-col gap-2">
      <div aria-live="polite">
        {error ? (
          <p className="flex items-start gap-2 rounded-md border border-danger bg-danger-weak p-3 text-base text-text">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-danger" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-base text-muted">
          Nothing defined yet.{" "}
          {canEdit
            ? "Add the things your table reaches for twice a session — rope, torches, rations."
            : "Ask the GM to define something."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) =>
            editing === entry.id ? (
              <li key={entry.id}>
                <EntryForm
                  entry={entry}
                  onDone={() => setEditing(null)}
                  onError={setError}
                />
              </li>
            ) : (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base text-text">{entry.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-faint">
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
                    {entry.types
                      .filter((t) => t !== "Physical Object")
                      .map((type) => (
                        <Chip key={type} tone="primary">
                          {type}
                        </Chip>
                      ))}
                  </p>
                </div>

                {/* Derived, and the reason a retire can be refused on
                    evidence rather than on a guess. */}
                <Chip tone={entry.copies > 0 ? "accent" : "neutral"}>
                  {entry.copies} in play
                </Chip>

                {canEdit ? (
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={() => setEditing(entry.id)}>
                      Edit
                    </Button>
                    <RetireButton entry={entry} onError={setError} />
                  </div>
                ) : null}
              </li>
            ),
          )}
        </ul>
      )}

      {canEdit ? (
        adding ? (
          <EntryForm onDone={() => setAdding(false)} onError={setError} />
        ) : (
          <Button
            icon="plus"
            variant="primary"
            className="self-start"
            onClick={() => setAdding(true)}
          >
            Define something
          </Button>
        )
      ) : null}
    </div>
  );
}

/**
 * Add and edit, one form.
 *
 * A plain `<form action={…}>` rather than client state per field: nothing here
 * needs to feel instant the way a hit point does, and a real form submission
 * keeps the whole thing working with JavaScript off.
 */
function EntryForm({
  entry,
  onDone,
  onError,
}: {
  entry?: CatalogItemView;
  onDone: () => void;
  onError: (message: string | null) => void;
}) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [typesText, setTypesText] = useState(
    entry?.types.join(", ") ?? "Physical Object",
  );
  const types = typesText
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");

  const submit = (formData: FormData) => {
    onError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = entry
        ? await updateCatalogItemAction(formData)
        : await createCatalogItemAction(formData);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        onError(result.error ?? "Could not save that entry.");
        return;
      }
      onDone();
    });
  };

  return (
    <form
      action={submit}
      className="flex flex-col gap-3 rounded-md border border-primary bg-surface p-4"
    >
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}

      <h2 className="font-serif text-lg font-bold text-text">
        {entry ? `Editing ${entry.name}` : "Define something"}
      </h2>

      {entry && entry.copies > 0 ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-accent-weak p-2 text-sm text-text">
          <Icon name="info" size={13} className="mt-0.5 shrink-0 text-accent" />
          <span>
            {entry.copies} {entry.copies === 1 ? "copy is" : "copies are"} in
            play. Saving changes {entry.copies === 1 ? "it" : "them"} too — that
            is what the catalogue is for.
          </span>
        </p>
      ) : null}

      <TextField
        id={`catalog-name-${entry?.id ?? "new"}`}
        name="name"
        label="Name"
        required
        defaultValue={entry?.name ?? ""}
        error={fieldErrors.name}
        placeholder="Rope, hempen (10 m)"
      />

      <div className="grid gap-3 panel:grid-cols-2">
        <TextField
          id={`catalog-weight-${entry?.id ?? "new"}`}
          name="weight"
          label="Weight"
          type="number"
          min={0}
          step={0.5}
          numeric
          defaultValue={entry?.weight ?? 0}
          error={fieldErrors.weight}
        />
        <TextField
          id={`catalog-value-${entry?.id ?? "new"}`}
          name="value"
          label="Value"
          numeric
          defaultValue={entry?.value ?? ""}
          error={fieldErrors.value}
          placeholder="4 sp"
        />
      </div>

      <TextField
        id={`catalog-types-${entry?.id ?? "new"}`}
        name="types"
        label="Types"
        value={typesText}
        onChange={(e) => setTypesText(e.target.value)}
        error={fieldErrors.types}
        hint="Comma separated. These decide which database it belongs to, and so which columns it has — Weapon adds Grip, STR, Damage, Durability and Features; Gear and Consumable add Effect."
      />

      <StatFields
        idPrefix={`catalog-${entry?.id ?? "new"}`}
        types={types}
        values={entry?.stats ?? {}}
      />

      <TextField
        id={`catalog-tags-${entry?.id ?? "new"}`}
        name="tags"
        label="Tags"
        defaultValue={entry?.tags.join(", ") ?? ""}
        error={fieldErrors.tags}
        placeholder="gear, consumable"
      />

      <TextAreaField
        id={`catalog-notes-${entry?.id ?? "new"}`}
        name="notes"
        label="Notes"
        defaultValue={entry?.notes ?? ""}
        placeholder="What the table should know about it."
      />

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : entry ? "Save entry" : "Add to catalogue"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Two-step, like every other destructive control in Arca.
 *
 * The server refuses while copies exist and says how many; this surfaces that
 * message rather than a generic failure, because the number IS the useful half
 * of the answer.
 */
function RetireButton({
  entry,
  onError,
}: {
  entry: CatalogItemView;
  onError: (message: string | null) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!armed) {
    return (
      <Button size="sm" variant="danger" onClick={() => setArmed(true)}>
        Retire
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            onError(null);
            const result = await archiveCatalogItemAction(entry.id);
            setArmed(false);
            if (!result.ok) onError(result.error ?? "Could not retire that.");
          })
        }
      >
        Confirm
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
