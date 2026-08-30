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
import { RetireContainerButton } from "@frontend/components/organisms/RetireContainerButton";
import type { ContainerType } from "@backend/domain/types";
import type { ContainerView, Principal } from "@backend/domain/view";

/**
 * Create or edit a container — SCOPE.md §3.
 *
 * Who may do what is decided on the server and arrives here as `allowedTypes`,
 * `canReshape` and whether `retireFallbackHref` was passed. A player sees a
 * shorter list of kinds, no owner picker, and a frozen kind on an existing
 * container; the GM sees all of it.
 *
 * The form is shaped by one rule: a character container has exactly one owner,
 * and the other two have none. Rather than let someone fill in an owner and
 * then be told it was wrong, the owner field only appears for the type that
 * takes one — and the same zod schema still rejects the combination on the
 * server, because a hidden field is a courtesy and not an enforcement.
 */
/**
 * What changing the kind will actually do to who can see this.
 *
 * Named consequences, not a generic "are you sure": the GM needs to know that a
 * pack becoming a world container drops out of its owner's sidebar, because
 * that is the part they cannot see happening from this screen.
 */
function kindChangeWarning(from: ContainerType, to: ContainerType): string {
  if (from === "character") {
    return to === "party"
      ? "This pack becomes a shared container. Its owner loses exclusive access and everyone at the table can edit it."
      : "This pack becomes a world container. Its owner loses it, and no player will see it again until you reveal it.";
  }
  if (to === "character") {
    return "This becomes one player's pack. Only they and you will see it, and everyone else loses access to what is inside.";
  }
  if (to === "world") {
    return "This becomes a world container. Players can no longer edit it, and it stays hidden until you reveal it.";
  }
  return "This becomes a shared container. Every player at the table will be able to read and edit it.";
}

const TYPES: { value: ContainerType; label: string; hint: string }[] = [
  { value: "character", label: "Pack", hint: "One player's own. Only they and the GM may change it." },
  { value: "party", label: "Shared", hint: "Everyone at the table can read and edit it." },
  { value: "world", label: "World", hint: "Yours until you reveal it. Players never edit it." },
];

export function ContainerEditorDialog({
  members,
  container,
  closeHref,
  retireFallbackHref,
  allowedTypes,
  canReshape,
  selfId,
}: {
  /** For the owner picker on a character container. Empty for a player, who
   *  does not get one — see `canReshape`. */
  members: Principal[];
  /** Absent when creating. */
  container?: ContainerView;
  closeHref: string;
  /** Where to land after retiring. Absent hides the retire control — either
   *  there is nowhere safe to go afterwards, or this principal may not retire
   *  this container. */
  retireFallbackHref?: string;
  /**
   * The kinds this principal may create, from `creatableContainerTypes`.
   *
   * Passed in rather than computed here because this is a client component and
   * the permission rules are server code. The server checks the submission
   * again regardless: a narrowed radio list is a courtesy, not the
   * enforcement.
   */
  allowedTypes: ContainerType[];
  /** Whether this principal may change an existing container's KIND or OWNER
   *  — the GM alone. Everyone else edits name and capacity only. */
  canReshape: boolean;
  /** The signed-in user, used as the implicit owner when a player adds their
   *  own pack. */
  selfId: string;
}) {
  const editing = container !== undefined;

  // A world container is the GM's usual reason to open this, so it stays their
  // default; a player who cannot make one starts on their own pack.
  const [type, setType] = useState<ContainerType>(
    container?.type ??
      (allowedTypes.includes("world") ? "world" : (allowedTypes[0] ?? "party")),
  );

  /**
   * Visibility is controlled state, not a `defaultChecked`, because it has to
   * react to the kind changing.
   *
   * A pack is stored as `revealed: true` — it is never hidden — so converting
   * one to a world container would otherwise start with the box ticked and
   * publish it the moment it was saved, directly contradicting the warning
   * shown above it. Becoming a world container means becoming hidden, which is
   * the safe default and the one the GM is being told to expect.
   */
  const [revealed, setRevealed] = useState(
    container?.type === "world" ? container.revealed : false,
  );

  const pickType = (next: ContainerType) => {
    setType(next);
    if (next === "world") {
      setRevealed(container?.type === "world" ? container.revealed : false);
    }
  };
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

          {/* Changing the kind moves the container between permission rules,
              so the consequence is stated BEFORE saving rather than discovered
              after — a pack turned world container disappears from its former
              owner's sidebar. */}
          {editing && type !== container.type ? (
            <p className="flex items-start gap-2 rounded-md border border-warning bg-warning-weak p-3 text-base text-text">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-warning" />
              <span>{kindChangeWarning(container.type, type)}</span>
            </p>
          ) : null}

          {/* Frozen for anyone but the GM once the container exists. Reshaping
              one is how the shared wagon would quietly become a private pack,
              so `assertCanEditContainer` refuses it and the form does not
              offer it. The value is still submitted — omitting it would read
              as a patch that clears the kind. */}
          {editing && !canReshape ? (
            <>
              <input type="hidden" name="type" value={container.type} />
              <FieldShell id="type" label="Kind">
                <div className="rounded-md border border-border bg-surface2 px-2 py-2">
                  <span className="block text-base text-text">
                    {TYPES.find((t) => t.value === container.type)?.label ??
                      container.type}
                  </span>
                  <span className="block text-sm text-muted">
                    Only the GM can change what kind of container this is.
                  </span>
                </div>
              </FieldShell>
            </>
          ) : (
          <FieldShell id="type" label="Kind" required>
            <div className="flex flex-col gap-1">
              {/* The container's own kind stays listed even when this
                  principal could not create one like it, so editing never
                  silently rewrites what is already there. */}
              {TYPES.filter(
                (option) =>
                  allowedTypes.includes(option.value) ||
                  option.value === container?.type,
              ).map((option) => (
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
                    onChange={() => pickType(option.value)}
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

          {type === "character" ? (
            canReshape ? (
            <FieldShell
              id="ownerId"
              label="Belongs to"
              required
              error={fieldErrors.ownerId}
            >
              <select
                id="ownerId"
                name="ownerId"
                defaultValue={container?.ownerId ?? ""}
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
            ) : (
              /* A player does not choose an owner, because the rule that lets
                 them add a pack at all is that the owner is themselves. There
                 is nothing to pick, so the field states the answer and submits
                 it. */
              <>
                <input type="hidden" name="ownerId" value={selfId} />
                <FieldShell id="ownerId" label="Belongs to">
                  <p className="rounded-md border border-border bg-surface2 px-2 py-2 text-base text-text">
                    You
                  </p>
                </FieldShell>
              </>
            )
          ) : (
            /* Submitted empty so the server sees "no owner" explicitly rather
               than a missing key it has to interpret. This is also what strips
               the owner when a pack is converted to a shared or world
               container — the invariant is satisfied by the same submit that
               breaks it. */
            <input type="hidden" name="ownerId" value="" />
          )}

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
                checked={revealed}
                onChange={(e) => setRevealed(e.target.checked)}
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

      {/* Outside the form on purpose: it is a separate action with its own
          confirmation, and nesting it would make Enter in the name field a
          possible retire. */}
      {editing && retireFallbackHref ? (
        <RetireContainerButton
          containerId={container.id}
          containerName={container.name}
          fallbackHref={retireFallbackHref}
        />
      ) : null}
    </Modal>
  );
}
