"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { repository } from "@backend/db";
import { AddMemberInput } from "@backend/domain/view";
import { PermissionError } from "@backend/lib/permissions";
import { emailProblem, normaliseEmail } from "@backend/lib/password";
import { requirePrincipal } from "@backend/lib/session";

/**
 * The roster — the GM's side of who is at this table.
 *
 * Two verbs, and both are the GM's: adding someone, and clearing a forgotten
 * password. Self-signup is a different door entirely
 * (`signUpAction`), takes no principal, and can only ever mint a player.
 *
 * The permission check is `assertCanManageRoster` inside the repository, not
 * here. This layer decides what to say when it throws; the repository decides
 * whether it may happen, so a second caller cannot skip the rule by not
 * knowing about it.
 */

function text(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

export async function addMemberAction(formData: FormData): Promise<void> {
  const principal = await requirePrincipal();

  const displayName = text(formData.get("displayName")).trim();
  const email = normaliseEmail(text(formData.get("email")));
  const role = text(formData.get("role"));

  const at = "/members";

  if (emailProblem(email)) redirect(`${at}?error=bad-email`);

  const parsed = AddMemberInput.safeParse({ displayName, email, role });
  if (!parsed.success) redirect(`${at}?error=bad-input`);

  try {
    const member = await repository().addMember(principal, parsed.data);
    // `null` is "that address is already here", which is the one thing the GM
    // is entitled to be told plainly — they are looking at the roster it is on.
    if (!member) redirect(`${at}?error=taken`);
  } catch (error) {
    if (error instanceof PermissionError) redirect(`${at}?error=forbidden`);
    throw error;
  }

  revalidatePath(at);
  redirect(`${at}?added=${encodeURIComponent(email)}`);
}

/**
 * Clear a password so the member can choose a new one.
 *
 * This is the whole of account recovery, and it is deliberately a person
 * asking a person: there is no reset mail because there is no mail. It puts
 * the member back into exactly the state a newly added one is in.
 */
export async function resetPasswordAction(formData: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const userId = text(formData.get("userId"));

  const at = "/members";

  // Not a hard rule, a guard rail: a GM who clears their OWN password is
  // signed in right now and would be locked out the moment this session ends,
  // with nobody able to let them back in. The repository does not forbid it —
  // a second GM clearing the first is legitimate — so the refusal belongs here,
  // where "you are doing this to yourself" is knowable.
  if (userId === principal.userId) redirect(`${at}?error=self-reset`);

  try {
    await repository().resetMemberPassword(principal, userId);
  } catch (error) {
    if (error instanceof PermissionError) redirect(`${at}?error=forbidden`);
    throw error;
  }

  revalidatePath(at);
  redirect(`${at}?reset=1`);
}
