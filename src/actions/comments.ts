"use server";

import { revalidatePath } from "next/cache";

import { repository } from "@/db";
import { ConflictError, NotFoundError } from "@/db/repository";
import { CreateCommentInput } from "@/domain/view";
import { PermissionError } from "@/lib/permissions";
import { requirePrincipal } from "@/lib/session";

import type { ActionResult } from "./items";

/**
 * Posting to a container's thread — M12.
 *
 * Comments are deliberately NOT announced on the realtime channel. M8's budget
 * is about inventory: a stale item list gets someone's loot wrong, whereas a
 * comment arriving on the next navigation costs nothing. Pushing every typed
 * sentence to six panels would also mean a re-render per keystroke-ending,
 * which is a lot of churn for a line of table talk.
 */
export async function createCommentAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const principal = await requirePrincipal();
    const parsed = CreateCommentInput.safeParse({
      containerId: formData.get("containerId"),
      content: formData.get("content"),
      parentId: formData.get("parentId") || null,
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: issue?.message ?? "Say something first." };
    }

    await repository().createComment(principal, parsed.data);
    revalidatePath("/c/[containerId]", "page");
    return { ok: true };
  } catch (error) {
    if (
      error instanceof PermissionError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError
    ) {
      return { ok: false, error: error.message };
    }
    console.error("[arca] comment failed", error);
    return { ok: false, error: "Could not post that. Nothing was saved." };
  }
}
