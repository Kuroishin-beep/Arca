"use server";

import { revalidatePath } from "next/cache";

import { repository } from "@backend/db";
import { ConflictError, NotFoundError } from "@backend/db/repository";
import { CreateContainerInput, UpdateContainerInput } from "@backend/domain/view";
import { campaignId } from "@backend/lib/campaign";
import { PermissionError } from "@backend/lib/permissions";
import { requirePrincipal } from "@backend/lib/session";
import { realtime } from "@backend/realtime";

import type { ActionResult } from "./items";

/**
 * Creating and retiring containers — SCOPE.md §3, GM only.
 *
 * The permission check lives in the repository, not here, because both storage
 * backends must obey it and an action is not the only possible caller. This
 * layer parses the form and translates a thrown error into something a GM can
 * act on.
 */

function toResult<T = undefined>(
  error: unknown,
  fallback: string,
): ActionResult<T> {
  if (
    error instanceof PermissionError ||
    error instanceof ConflictError ||
    error instanceof NotFoundError
  ) {
    return { ok: false, error: error.message };
  }
  console.error("[arca] container action failed", error);
  return { ok: false, error: fallback };
}

function fieldErrorsOf(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const segment = issue.path[0];
    const key =
      typeof segment === "string" || typeof segment === "number"
        ? String(segment)
        : "form";
    out[key] ??= issue.message;
  }
  return out;
}

/** FormData values are `string | File`; anything not text is treated as absent. */
function text(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

export async function createContainerAction(
  formData: FormData,
): Promise<ActionResult<{ containerId: string }>> {
  try {
    const principal = await requirePrincipal();

    const capacityRaw = text(formData.get("capacity")).trim();
    const ownerRaw = text(formData.get("ownerId")).trim();

    const parsed = CreateContainerInput.safeParse({
      name: formData.get("name"),
      type: formData.get("type"),
      // An empty select means "no owner", which is a real value here rather
      // than a missing one — the schema rejects it for a character container.
      ownerId: ownerRaw === "" ? null : ownerRaw,
      capacity: capacityRaw === "" ? null : Number(capacityRaw),
      revealed: formData.get("revealed") === "on",
    });

    if (!parsed.success) {
      return {
        ok: false,
        error: "Fix the highlighted fields.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    const created = await repository().createContainer(principal, parsed.data);

    revalidatePath("/c/[containerId]", "page");
    // The sidebar is rendered from the container list on every screen, so a new
    // container has to reach the other panels the same way an item does.
    await announce(principal.userId, created.id);

    return { ok: true, data: { containerId: created.id } };
  } catch (error) {
    return toResult(error, "Could not create that container.");
  }
}

export async function updateContainerAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const principal = await requirePrincipal();

    const capacityRaw = text(formData.get("capacity")).trim();
    const parsed = UpdateContainerInput.safeParse({
      id: formData.get("id"),
      name: formData.get("name"),
      // The form always submits this field, so empty genuinely means "no
      // limit" rather than "not supplied" — the third state (leave alone) is
      // for programmatic callers, not for this dialog.
      capacity: capacityRaw === "" ? null : Number(capacityRaw),
      revealed: formData.get("revealed") === "on",
    });

    if (!parsed.success) {
      return {
        ok: false,
        error: "Fix the highlighted fields.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    await repository().updateContainer(principal, parsed.data);

    revalidatePath("/c/[containerId]", "page");
    await announce(principal.userId, parsed.data.id);

    return { ok: true };
  } catch (error) {
    return toResult(error, "Could not save that container.");
  }
}

/**
 * The one-click reveal — the flow this whole feature exists for.
 *
 * Separate from `updateContainerAction` because it is a different act: the GM
 * is not editing a record, they are telling the table that a chest is now
 * there. Routing it through the full form would mean reading and resubmitting
 * name and capacity to change one boolean, and any drift between what the form
 * held and what the database holds would be written back as a silent edit.
 */
export async function setContainerRevealedAction(
  containerId: string,
  revealed: boolean,
): Promise<ActionResult> {
  try {
    const principal = await requirePrincipal();
    await repository().updateContainer(principal, {
      id: containerId as UpdateContainerInput["id"],
      revealed,
    });

    revalidatePath("/c/[containerId]", "page");
    await announce(principal.userId, containerId);

    return { ok: true };
  } catch (error) {
    return toResult(error, "Could not change that.");
  }
}

export async function archiveContainerAction(
  containerId: string,
): Promise<ActionResult> {
  try {
    const principal = await requirePrincipal();
    await repository().archiveContainer(principal, containerId);

    revalidatePath("/c/[containerId]", "page");
    await announce(principal.userId, containerId);

    return { ok: true };
  } catch (error) {
    return toResult(error, "Could not retire that container.");
  }
}

/** Non-fatal, exactly as in `items.ts`: the write has already committed, and a
 *  failed announcement means other panels notice late, not that it failed. */
async function announce(actorId: string, containerId: string): Promise<void> {
  try {
    await realtime().publish(campaignId(), {
      kind: "items-changed",
      containerIds: [containerId],
      actorId,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[arca] realtime publish failed", error);
  }
}
