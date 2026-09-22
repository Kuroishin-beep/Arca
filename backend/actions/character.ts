"use server";

import { revalidatePath } from "next/cache";

import { repository } from "@backend/db";
import { ConflictError, NotFoundError } from "@backend/db/repository";
import {
  UpdateCharacterInput,
  UpdateContainerInput,
} from "@backend/domain/view";
import { campaignId } from "@backend/lib/campaign";
import { PermissionError } from "@backend/lib/permissions";
import { requirePrincipal } from "@backend/lib/session";
import { realtime } from "@backend/realtime";

import type { ActionResult } from "./items";

/**
 * The character sheet's writes — SCOPE.md S1.
 *
 * One action, taking one section at a time. That is not a limitation of the
 * form: it is the concurrency model. The sheet is the one screen in Arca that
 * two people edit at once as a matter of course — a GM marking damage while
 * the player ticks a skill — and a single "save the whole sheet" call means
 * whoever clicked second silently discards the other's work. A patch carrying
 * only `hp` cannot overwrite `skills`, so it cannot.
 *
 * Permission is `canWrite` on the container, checked inside the repository so
 * both storage backends obey it. A player may edit their own sheet; the GM may
 * edit anyone's. There is no new rule here and there should not be one — "whose
 * character is this?" already had exactly one answer.
 */

/**
 * Announce on the campaign channel, non-fatal for the same reason the item
 * actions' version is: the write has already committed, and a failure here
 * costs other panels a refresh, not the change.
 */
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

function toResult(error: unknown, fallback: string): ActionResult {
  if (
    error instanceof PermissionError ||
    error instanceof ConflictError ||
    error instanceof NotFoundError
  ) {
    return { ok: false, error: error.message };
  }
  console.error("[arca] character action failed", error);
  return { ok: false, error: fallback };
}

/**
 * The patch as it arrives from the client: one or more sections, already
 * JSON-shaped. Validated by the same schemas the domain uses, so a hand-rolled
 * POST cannot put STR 40 on a sheet any more than the form can.
 *
 * Typed as `unknown` rather than the parsed shape on purpose — this is a trust
 * boundary, and naming the type it is SUPPOSED to be is how a caller ends up
 * believing it already is one.
 */
export interface CharacterPatch {
  attributes?: unknown;
  hp?: unknown;
  wp?: unknown;
  deathRolls?: unknown;
  conditions?: unknown;
  profile?: unknown;
  skills?: unknown;
  spells?: unknown;
}

export async function updateCharacterAction(
  containerId: string,
  patch: CharacterPatch,
): Promise<ActionResult> {
  try {
    const principal = await requirePrincipal();

    const parsed = UpdateCharacterInput.safeParse({
      containerId,
      ...patch,
    });

    if (!parsed.success) {
      return {
        ok: false,
        error: "That change is not a legal one for this sheet.",
      };
    }

    await repository().updateCharacter(principal, parsed.data);

    // Both screens that read a character: the sheet itself, and the workspace,
    // whose header and encumbrance meter sit on the same container.
    revalidatePath("/character/[containerId]", "page");
    revalidatePath("/c/[containerId]", "page");
    await announce(principal.userId, containerId);

    return { ok: true };
  } catch (error) {
    return toResult(error, "Could not save that change.");
  }
}

/**
 * Renaming the character.
 *
 * Deliberately `updateContainer` rather than a character-specific write: the
 * character's name IS the container's name (see `CharacterView`), so this is
 * the existing rename, reached from a second screen. Giving the sheet its own
 * name field would have created a second string to keep in step with the
 * sidebar, and they would have disagreed the first time somebody used the
 * container editor instead.
 */
export async function renameCharacterAction(
  containerId: string,
  name: string,
): Promise<ActionResult> {
  try {
    const principal = await requirePrincipal();

    // Parsed rather than cast: `UpdateContainerInput` already carries the name
    // rules AND brands the id, so going through it is both the validation and
    // the only honest way to produce a `ContainerId`.
    const parsed = UpdateContainerInput.safeParse({
      id: containerId,
      name,
    });

    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "That name will not do.",
      };
    }

    await repository().updateContainer(principal, parsed.data);

    // Every screen that shows a container name, because they all show this one.
    revalidatePath("/character/[containerId]", "page");
    revalidatePath("/c/[containerId]", "page");
    revalidatePath("/db/[slug]", "page");
    revalidatePath("/members", "page");
    await announce(principal.userId, containerId);

    return { ok: true };
  } catch (error) {
    return toResult(error, "Could not rename that character.");
  }
}
