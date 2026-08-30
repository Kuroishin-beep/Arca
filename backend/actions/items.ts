"use server";

import { revalidatePath } from "next/cache";

import { repository } from "@backend/db";
import { ConflictError, NotFoundError } from "@backend/db/repository";
import {
  CreateItemInput,
  MoveItemInput,
  UpdateItemInput,
} from "@backend/domain/view";
import { campaignId } from "@backend/lib/campaign";
import { PermissionError } from "@backend/lib/permissions";
import { requirePrincipal } from "@backend/lib/session";
import { realtime } from "@backend/realtime";

/**
 * Server Actions — every mutation in the app.
 *
 * Three rules hold across all of them:
 *
 *   1. The SAME zod schema validates the form and the action. There is no
 *      second, hand-written server-side validator to drift from the first.
 *   2. Permission is checked HERE, server-side, on every call. The dialog
 *      disabling a destination is a courtesy; this is the enforcement
 *      (SCOPE.md §3, M11).
 *   3. Every successful write is announced on the campaign channel. This is
 *      the half of M8 that `revalidatePath` cannot do: revalidation refreshes
 *      the person who acted, and the entire point of live sync is the other
 *      five people at the table.
 */

/**
 * Announce a write. Deliberately non-fatal.
 *
 * The database transaction has already committed by the time this runs, so a
 * failure here does not mean the write failed — it means other panels will
 * notice late, on their next navigation or reconnect. Throwing would turn a
 * delivered-but-unannounced change into a red error on a move that actually
 * worked, which is precisely the "the app lost my loot" reading that
 * `toResult` exists to prevent.
 */
async function announce(
  actorId: string,
  containerIds: string[],
): Promise<void> {
  try {
    await realtime().publish(campaignId(), {
      kind: "items-changed",
      containerIds: containerIds.filter((id, i, all) => all.indexOf(id) === i),
      actorId,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[arca] realtime publish failed", error);
  }
}

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  /** Keyed by field name, so an input can render its own message. */
  fieldErrors?: Record<string, string>;
  data?: T;
}

/**
 * Turns a thrown error into something a player can act on. A raw stack trace at
 * a table is worse than useless — it reads as "the app lost my loot".
 */
function toResult<T = undefined>(error: unknown): ActionResult<T> {
  if (error instanceof PermissionError) {
    return { ok: false, error: error.message };
  }
  if (error instanceof ConflictError) {
    return { ok: false, error: error.message };
  }
  if (error instanceof NotFoundError) {
    return { ok: false, error: error.message };
  }
  console.error("[arca] action failed", error);
  return { ok: false, error: "Something went wrong. Nothing was changed." };
}

function fieldErrorsOf(error: unknown): Record<string, string> {
  const issues = (error as { issues?: { path: unknown[]; message: string }[] })
    .issues;
  if (!Array.isArray(issues)) return {};
  const out: Record<string, string> = {};
  for (const issue of issues) {
    // A zod path segment is a string or an array index. Anything else has no
    // field to render against, so it belongs to the form as a whole rather
    // than being stringified into a key no input will ever match.
    const segment = issue.path[0];
    const key =
      typeof segment === "string" || typeof segment === "number"
        ? String(segment)
        : "form";
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * A FormData value is `string | File`. A File stringifies to "[object File]",
 * which would sail through validation as a plausible-looking name — so
 * anything that is not text is treated as absent rather than coerced.
 */
function text(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

/** Tags and types arrive as comma-separated text from the form. */
function splitList(raw: FormDataEntryValue | null): string[] {
  return text(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

export async function createItemAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const principal = await requirePrincipal();
    const parsed = CreateItemInput.safeParse({
      containerId: formData.get("containerId"),
      name: formData.get("name"),
      qty: formData.get("qty"),
      weight: formData.get("weight"),
      value: formData.get("value") ?? "",
      tags: splitList(formData.get("tags")),
      notes: formData.get("notes") ?? "",
      types: splitList(formData.get("types")),
    });

    if (!parsed.success) {
      return {
        ok: false,
        error: "Fix the highlighted fields.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    await repository().createItem(principal, parsed.data);
    revalidatePath("/c/[containerId]", "page");
    await announce(principal.userId, [parsed.data.containerId]);
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function updateItemAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const principal = await requirePrincipal();
    const parsed = UpdateItemInput.safeParse({
      id: formData.get("id"),
      name: formData.get("name"),
      qty: formData.get("qty"),
      weight: formData.get("weight"),
      value: formData.get("value") ?? "",
      tags: splitList(formData.get("tags")),
      notes: formData.get("notes") ?? "",
      types: splitList(formData.get("types")),
    });

    if (!parsed.success) {
      return {
        ok: false,
        error: "Fix the highlighted fields.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    const updated = await repository().updateItem(principal, parsed.data);
    revalidatePath("/c/[containerId]", "page");
    await announce(principal.userId, [updated.containerId]);
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

/** Soft delete. Reversible, because a mis-tap mid-session must be. */
export async function archiveItemAction(
  itemId: string,
): Promise<ActionResult> {
  try {
    const principal = await requirePrincipal();
    // Read the item BEFORE archiving: afterwards it is filtered out of every
    // query, and the announcement would have no container to name.
    const doomed = await repository().getItem(principal, itemId);
    await repository().archiveItem(principal, itemId);
    revalidatePath("/c/[containerId]", "page");
    if (doomed) await announce(principal.userId, [doomed.containerId]);
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * THE action. Authorises both ends, splits partial stacks, and runs in one
 * transaction against Postgres.
 */
export async function moveItemAction(
  formData: FormData,
): Promise<ActionResult<{ message: string }>> {
  try {
    const principal = await requirePrincipal();
    const parsed = MoveItemInput.safeParse({
      itemId: formData.get("itemId"),
      toContainerId: formData.get("toContainerId"),
      qty: formData.get("qty"),
    });

    if (!parsed.success) {
      return {
        ok: false,
        error: "Pick a destination and a quantity.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    const outcome = await repository().moveItem(principal, parsed.data);
    const containers = await repository().listContainers(principal);
    const destination =
      containers.find((c) => c.id === outcome.toContainerId)?.name ??
      "the destination";

    revalidatePath("/c/[containerId]", "page");
    // BOTH ends. A move is the one operation that invalidates two containers,
    // and a panel showing only the source would keep displaying an item that
    // is no longer there.
    await announce(principal.userId, [
      outcome.fromContainerId,
      outcome.toContainerId,
    ]);
    return {
      ok: true,
      data: {
        message: `Moved ${outcome.movedQty} × ${outcome.itemName} to ${destination}.`,
      },
    };
  } catch (error) {
    return toResult(error);
  }
}
