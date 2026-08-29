"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createItemAction, updateItemAction } from "@/actions/items";
import { Button } from "@/components/atoms/Button";
import { ContainerDot } from "@/components/atoms/Chip";
import { TextAreaField, TextField } from "@/components/atoms/Field";
import { Icon } from "@/components/atoms/Icon";
import { Modal } from "@/components/molecules/Modal";
import type { ContainerView, ItemView } from "@/domain/view";

/**
 * Add and edit are the same form. The only differences are the title, whether
 * fields start populated, and which action receives the submit — so they are
 * one component rather than two that drift.
 *
 * Field names match the zod schema in `src/domain/view.ts` exactly, and that
 * same schema validates the Server Action. There is no second, hand-written
 * server-side validator to fall out of step with this markup.
 */
export function ItemEditorDialog({
  container,
  item,
  closeHref,
}: {
  container: ContainerView;
  /** Absent when adding. */
  item?: ItemView;
  closeHref: string;
}) {
  const editing = item !== undefined;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
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
      router.push(closeHref);
      router.refresh();
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
        {editing ? (
          <input type="hidden" name="id" value={item.id} />
        ) : (
          <input type="hidden" name="containerId" value={container.id} />
        )}

        {!editing ? (
          <p className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm text-muted">
            <ContainerDot type={container.type} />
            into {container.name}
          </p>
        ) : null}

        <div className="flex flex-col gap-4 p-4">
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

          <TextField
            id="name"
            name="name"
            label="Name"
            required
            defaultValue={item?.name ?? ""}
            error={fieldErrors.name}
            placeholder="Rope, hempen (10 m)"
          />

          <TextField
            id="types"
            name="types"
            label="Types"
            defaultValue={item?.types.join(", ") ?? "Physical Object"}
            error={fieldErrors.types}
            hint="Comma separated. An object may hold several types; each contributes its properties."
          />

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
