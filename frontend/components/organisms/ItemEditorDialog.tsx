"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createItemAction, updateItemAction } from "@backend/actions/items";
import { Button } from "@frontend/components/atoms/Button";
import { TextAreaField, TextField } from "@frontend/components/atoms/Field";
import { Icon } from "@frontend/components/atoms/Icon";
import { Modal } from "@frontend/components/molecules/Modal";
import { StatFields } from "@frontend/components/molecules/StatFields";
import type { ContainerView, ItemView } from "@backend/domain/view";

/**
 * Add and edit are the same form. The only differences are the title, whether
 * fields start populated, and which action receives the submit — so they are
 * one component rather than two that drift.
 *
 * Field names match the zod schema in `backend/domain/view.ts` exactly, and that
 * same schema validates the Server Action. There is no second, hand-written
 * server-side validator to fall out of step with this markup.
 */
export function ItemEditorDialog({
  container,
  destinations,
  item,
  closeHref,
}: {
  container: ContainerView;
  /** Where a new item may go: every container this person may write to. The
   *  one the dialog was opened from is preselected. */
  destinations?: ContainerView[];
  /** Absent when adding. */
  item?: ItemView;
  closeHref: string;
}) {
  const editing = item !== undefined;
  /**
   * A catalogue copy owns its quantity and notes and nothing else (SCOPE.md
   * S3). Its other fields are shown READ-ONLY rather than disabled: a disabled
   * input drops out of the form data, whereas a read-only one still submits
   * the value it displayed, which the server accepts as unchanged. Letting
   * them be typed into would be inviting an edit the server has to refuse.
   */
  const isCopy = item?.catalogItemId != null;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Tracked so the type-specific inputs follow what is typed into Types.
  const [typesText, setTypesText] = useState(
    item?.types.join(", ") ?? "Physical Object",
  );
  const types = typesText
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = (formData: FormData) => {
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = editing
        ? await updateItemAction(formData)
        : await createItemAction(formData);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.error ?? "Could not save that.");
        return;
      }
      // Push only. The action has already called `revalidatePath`, which
      // drops the cached page, so this navigation fetches it fresh. A
      // `router.refresh()` straight after used to race it: fired while the URL
      // still said `?dialog=…`, it could land after the push and render the
      // dialog again over a save that had succeeded.
      // A new item: go to where it was put, which the container picker may
      // have changed from the container the dialog was opened on.
      const chosen = formData.get("containerId");
      router.push(!editing && typeof chosen === "string" ? `/c/${chosen}` : closeHref);
    });
  };

  const problemCount = Object.keys(fieldErrors).length;

  return (
    <Modal
      title={editing ? "Edit item" : "Add item"}
      closeHref={closeHref}
      subtitle={editing ? item.name : undefined}
    >
      <form action={onSubmit} id="item-form">
        {editing ? <input type="hidden" name="id" value={item.id} /> : null}

        <div className="flex flex-col gap-4 p-4">
          {/* Which container it goes in — chosen here, rather than fixed to
              wherever the dialog happened to be opened from. "New database"
              in the sidebar opens this from any screen, and the item belongs
              somewhere specific. */}
          {!editing ? (
            <div>
              <label htmlFor="containerId" className="mb-1 block text-sm font-medium text-muted">
                Container
              </label>
              <span className="block">
                <select
                  id="containerId"
                  name="containerId"
                  defaultValue={container.id}
                  className="h-9 w-full rounded-md border border-border bg-surface2 px-2 text-base text-text"
                >
                  {(destinations && destinations.length > 0 ? destinations : [container]).map(
                    (option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ),
                  )}
                </select>
              </span>
            </div>
          ) : null}

          {formError ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger bg-danger-weak p-3 text-base text-text"
            >
              <Icon
                name="alert"
                size={14}
                className="mt-0.5 shrink-0 text-danger"
              />
              <span>{formError}</span>
            </p>
          ) : null}

          {isCopy ? (
            <p className="flex items-start gap-2 rounded-md border border-border bg-accent-weak p-3 text-sm text-text">
              <Icon name="info" size={14} className="mt-0.5 shrink-0 text-accent" />
              <span>
                A copy from the catalogue. Its name, weight, value, tags, types
                and stats come from the{" "}
                <a href="/catalog" className="font-medium text-accent underline">
                  catalogue entry
                </a>{" "}
                and change for every copy at once. Here, only the quantity and
                notes are its own.
              </span>
            </p>
          ) : null}

          <TextField
            id="name"
            name="name"
            label="Name"
            required
            readOnly={isCopy}
            defaultValue={item?.name ?? ""}
            error={fieldErrors.name}
            placeholder="Rope, hempen (10 m)"
          />

          <TextField
            id="types"
            name="types"
            label="Types"
            readOnly={isCopy}
            value={typesText}
            onChange={(e) => setTypesText(e.target.value)}
            error={fieldErrors.types}
            hint="Comma separated. An object may hold several types; each contributes its properties."
          />

          <StatFields
            idPrefix="item"
            types={types}
            values={item?.stats ?? {}}
            readOnly={isCopy}
          />

          {/* Quantity is one plain number field — type it, or use the field's
              own arrows. The − / value / + stepper was three controls for one
              number, and wider than the space it was given. */}
          <div className="grid grid-cols-3 gap-3">
            <TextField
              id="qty"
              name="qty"
              label="Qty"
              type="number"
              min={1}
              step={1}
              numeric
              defaultValue={item?.qty ?? 1}
              error={fieldErrors.qty}
            />
            <TextField
              id="weight"
              name="weight"
              label="Weight"
              readOnly={isCopy}
              type="number"
              min={0}
              step={0.5}
              numeric
              defaultValue={item?.weight ?? 0}
              error={fieldErrors.weight}
            />
            <TextField
              id="value"
              name="value"
              label="Value"
              readOnly={isCopy}
              numeric
              defaultValue={item?.value ?? ""}
              error={fieldErrors.value}
              placeholder="5 gp"
            />
          </div>
          <p className="-mt-2 text-sm text-faint">
            Dragonbane counts light items as 0.5 and tiny ones as 0.
          </p>

          <TextField
            id="tags"
            name="tags"
            label="Tags"
            readOnly={isCopy}
            defaultValue={item?.tags.join(", ") ?? ""}
            error={fieldErrors.tags}
            placeholder="gear, consumable"
          />

          <TextAreaField
            id="notes"
            name="notes"
            label="Notes"
            rows={3}
            defaultValue={item?.notes ?? ""}
            error={fieldErrors.notes}
            placeholder="Anything the table should know…"
          />
        </div>

        <div className="flex items-center gap-2 border-t border-border p-4">
          {problemCount > 0 ? (
            <p className="mr-auto text-xs text-danger">
              {problemCount} problem{problemCount === 1 ? "" : "s"}
            </p>
          ) : (
            <span className="mr-auto" />
          )}
          <Button
            variant="secondary"
            onClick={() => router.push(closeHref)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save item"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
