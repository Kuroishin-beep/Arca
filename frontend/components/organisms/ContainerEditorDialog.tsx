"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createContainerAction,
  updateContainerAction,
} from "@backend/actions/containers";
import { Button } from "@frontend/components/atoms/Button";
import { FieldShell, TextField } from "@frontend/components/atoms/Field";
import { Icon } from "@frontend/components/atoms/Icon";
import { Modal } from "@frontend/components/molecules/Modal";
import type { ContainerType } from "@backend/domain/types";
import type { ContainerView, Principal } from "@backend/domain/view";

/**
 * Create a container — GM only (SCOPE.md §3).
 *
 * The form is shaped by one rule: a character container has exactly one owner,
 * and the other two have none. Rather than let someone fill in an owner and
 * then be told it was wrong, the owner field only appears for the type that
 * takes one — and the same zod schema still rejects the combination on the
 * server, because a hidden field is a courtesy and not an enforcement.
 */
const TYPES: { value: ContainerType; label: string; hint: string }[] = [
  { value: "character", label: "Pack", hint: "One player's own. Only they and the GM may change it." },
  { value: "party", label: "Shared", hint: "Everyone at the table can read and edit it." },
  { value: "world", label: "World", hint: "Yours until you reveal it. Players never edit it." },
];

export function ContainerEditorDialog({
  members,
  container,
  closeHref,
}: {
  /** For the owner picker on a character container. */
  members: Principal[];
  /** Absent when creating. Kind and owner are fixed once a container exists —
   *  see the note on UpdateContainerInput. */
  container?: ContainerView;
  closeHref: string;
}) {
  const editing = container !== undefined;
  const [type, setType] = useState<ContainerType>(container?.type ?? "world");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = (formData: FormData) => {
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = editing
        ? await updateContainerAction(formData)
        : await createContainerAction(formData);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(
          result.error ??
            (editing ? "Could not save that." : "Could not create that."),
        );
        return;
      }

      if (editing) {
        router.push(closeHref);
      } else {
        // Straight into the thing just made — an empty container is exactly
        // where you want to be, because the next step is putting something in
        // it.
        router.push(`/c/${result.data!.containerId}`);
      }
      router.refresh();
    });
  };

  return (
    <Modal
      title={editing ? "Edit container" : "New container"}
      subtitle={editing ? container.name : undefined}
      closeHref={closeHref}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => router.push(closeHref)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="container-form"
            variant="primary"
            disabled={pending}
          >
            {pending
              ? editing
                ? "Saving…"
                : "Creating…"
              : editing
                ? "Save"
                : "Create"}
          </Button>
        </>
      }
    >
      <form action={onSubmit} id="container-form">
        {editing ? <input type="hidden" name="id" value={container.id} /> : null}

        <div className="flex flex-col gap-4 p-4">
          {formError ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger bg-danger-weak p-3 text-base text-text"
            >
              <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-danger" />
              <span>{formError}</span>
            </p>
          ) : null}

          <TextField
            id="name"
            name="name"
            label="Name"
            required
            autoFocus
            maxLength={120}
            placeholder="The Barrow Chest"
            defaultValue={container?.name}
            error={fieldErrors.name}
          />

          {editing ? (
            /* Kind and owner are fixed. Retyping a container would have to
               strip or invent an owner to keep the ownership invariant, and it
               changes who can see the contents — that is a different operation
               wearing an edit's clothing. Shown, not offered. */
            <FieldShell id="kind-fixed" label="Kind">
              <p className="rounded-md border border-border bg-surface2 px-2 py-2 text-base text-muted">
                {TYPES.find((t) => t.value === container.type)?.label ??
                  container.type}
                <span className="block text-sm text-faint">
                  Set when the container was made. Retire it and make a new one
                  to change this.
                </span>
              </p>
            </FieldShell>
          ) : (
          <FieldShell id="type" label="Kind" required>
            <div className="flex flex-col gap-1">
              {TYPES.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border px-2 py-2 ${
                    type === option.value
                      ? "border-primary bg-primary-weak"
                      : "border-border bg-surface hover:bg-surface2"
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={option.value}
                    checked={type === option.value}
                    onChange={() => setType(option.value)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-text">
                      {option.label}
                    </span>
                    <span className="block text-sm text-muted">
                      {option.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </FieldShell>
          )}

          {!editing && type === "character" ? (
            <FieldShell
              id="ownerId"
              label="Belongs to"
              required
              error={fieldErrors.ownerId}
            >
              <select
                id="ownerId"
                name="ownerId"
                defaultValue=""
                className="h-9 w-full rounded-md border border-border bg-surface2 px-2 text-base text-text"
              >
                <option value="">Choose a player…</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </FieldShell>
          ) : !editing ? (
            /* Submitted empty so the server sees "no owner" explicitly rather
               than a missing key it has to interpret. */
            <input type="hidden" name="ownerId" value="" />
          ) : null}

          <TextField
            id="capacity"
            name="capacity"
            label="Capacity (kg)"
            numeric
            hint="Leave empty for no limit — a wagon is not encumbered, a person is."
            placeholder=""
            defaultValue={container?.capacity != null ? String(container.capacity) : ""}
            error={fieldErrors.capacity}
          />

          {type === "world" ? (
            <label className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-2">
              <input
                type="checkbox"
                name="revealed"
                defaultChecked={container?.revealed ?? false}
              />
              <span className="text-base text-text">
                Visible to players
                <span className="block text-sm text-muted">
                  {editing
                    ? "Off means players cannot see it, or its contents, at all."
                    : "Off by default. Players cannot see it, or its contents, until you turn this on."}
                </span>
              </span>
            </label>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
