"use server";

import { revalidatePath } from "next/cache";

import { repository } from "@backend/db";
import { ConflictError, NotFoundError } from "@backend/db/repository";
import {
  AddFromCatalogInput,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
} from "@backend/domain/view";
import { statsFromForm } from "@backend/domain/item-fields";
import { campaignId } from "@backend/lib/campaign";
import { PermissionError } from "@backend/lib/permissions";
import { requirePrincipal } from "@backend/lib/session";
import { realtime } from "@backend/realtime";

import type { ActionResult } from "./items";

/**
 * The catalogue's writes — SCOPE.md S3.
 *
 * Two audiences, two verbs. The GM DEFINES things; everyone else takes COPIES
 * of them. That split is the feature, and it is enforced in the repository
 * (`assertCanManageCatalog`) rather than here, so both storage backends obey
 * it and an action is not the only possible caller.
 *
 * Correcting an entry needs no fan-out write and there is deliberately no code
 * here that looks like one: copies hold no name and no weight of their own, so
 * the correction has already reached them by the time this returns. What the
 * revalidation below is for is telling the SCREENS.
 */

/** Non-fatal, for the reason the item actions' version is: the write has
 *  committed, and a failure here costs other panels a refresh, not the change. */
async function announce(actorId: string, containerIds: string[]): Promise<void> {
  try {
    await realtime().publish(campaignId(), {
      kind: "items-changed",
      containerIds,
      actorId,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[arca] realtime publish failed", error);
  }
}

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
  console.error("[arca] catalogue action failed", error);
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

function text(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

/** Comma-separated lists, the same parsing the item editor uses. */
function splitList(raw: FormDataEntryValue | null): string[] {
  return text(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/**
 * Every screen that can show a catalogue-backed value.
 *
 * Wider than it looks necessary, and deliberately: the point of correcting an
 * entry is that it lands everywhere, so revalidating only the catalogue would
 * leave five stale packs behind and make the feature look broken in exactly
 * the case it exists for.
 */
function revalidateEverywhere(): void {
  revalidatePath("/catalog", "page");
  revalidatePath("/c/[containerId]", "page");
  revalidatePath("/db/[slug]", "page");
  revalidatePath("/character/[containerId]", "page");
}

export async function createCatalogItemAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const principal = await requirePrincipal();

    const parsed = CreateCatalogItemInput.safeParse({
      name: formData.get("name"),
      weight: text(formData.get("weight")).trim() || 0,
      value: formData.get("value"),
      tags: splitList(formData.get("tags")),
      types: splitList(formData.get("types")),
      notes: formData.get("notes"),
      stats: statsFromForm(formData),
    });

    if (!parsed.success) {
      return {
        ok: false,
        error: "Fix the highlighted fields.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    await repository().createCatalogItem(principal, parsed.data);
    revalidateEverywhere();

    return { ok: true };
  } catch (error) {
    return toResult(error, "Could not add that to the catalogue.");
  }
}

export async function updateCatalogItemAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const principal = await requirePrincipal();

    const weightRaw = text(formData.get("weight")).trim();
    const parsed = UpdateCatalogItemInput.safeParse({
      id: formData.get("id"),
      name: formData.get("name"),
      weight: weightRaw === "" ? undefined : weightRaw,
      value: formData.get("value"),
      tags: splitList(formData.get("tags")),
      types: splitList(formData.get("types")),
      notes: formData.get("notes"),
      stats: statsFromForm(formData),
    });

    if (!parsed.success) {
      return {
        ok: false,
        error: "Fix the highlighted fields.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    await repository().updateCatalogItem(principal, parsed.data);
    revalidateEverywhere();

    return { ok: true };
  } catch (error) {
    return toResult(error, "Could not save that entry.");
  }
}

export async function archiveCatalogItemAction(
  catalogItemId: string,
): Promise<ActionResult> {
  try {
    const principal = await requirePrincipal();
    await repository().archiveCatalogItem(principal, catalogItemId);
    revalidateEverywhere();
    return { ok: true };
  } catch (error) {
    // A ConflictError here is the "copies still exist" refusal, and its
    // message already names the number — it is the useful half of the answer,
    // so it reaches the screen unedited.
    return toResult(error, "Could not retire that entry.");
  }
}

export async function addFromCatalogAction(
  formData: FormData,
): Promise<ActionResult<{ itemId: string }>> {
  try {
    const principal = await requirePrincipal();

    const parsed = AddFromCatalogInput.safeParse({
      catalogItemId: formData.get("catalogItemId"),
      containerId: formData.get("containerId"),
      qty: text(formData.get("qty")).trim() || 1,
    });

    if (!parsed.success) {
      return { ok: false, error: "That is not something you can take a copy of." };
    }

    const created = await repository().addFromCatalog(principal, parsed.data);

    revalidatePath("/c/[containerId]", "page");
    revalidatePath("/catalog", "page");
    await announce(principal.userId, [parsed.data.containerId]);

    return { ok: true, data: { itemId: created.id } };
  } catch (error) {
    return toResult(error, "Could not add that to the container.");
  }
}
