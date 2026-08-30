"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { repository } from "@backend/db";
import type { Principal } from "@backend/domain/view";
import {
  delayForAttempts,
  lockoutMinutes,
  pinProblem,
  recordFailure,
} from "@backend/lib/pin";
import { SESSION_COOKIE } from "@backend/lib/session";

/**
 * Sign in and out.
 *
 * One mechanism: pick your name from the campaign's roster, prove it with a
 * PIN. A member who has not chosen a PIN yet chooses one here on their first
 * sign-in, which is why this action covers both cases rather than splitting
 * into two — from the person's side it is the same act, and splitting it would
 * mean the screen had to tell a stranger which names are unclaimed.
 *
 * Failures come back as an `error` code in the query string rather than as
 * rendered text. The sign-in page is a server component with no client state,
 * so the code IS the state; and a code cannot carry anything into the page that
 * the page did not already have a message for.
 */

/** FormData values are `string | File`; anything not text is treated as absent
 *  rather than stringified into "[object File]" and then looked up. */
function text(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

/** Everything after a successful sign-in, shared by both paths above. */
async function land(principal: Principal): Promise<never> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, principal.userId, {
    httpOnly: true,
    sameSite: "lax",
    // The Symbiote loads Arca in an iframe, so a secure cookie is required in
    // production for it to be sent at all.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  const containers = await repository().listContainers(principal);
  const landing = containers.find((c) => c.type === "party") ?? containers[0];
  redirect(landing ? `/c/${landing.id}` : "/signin?error=no-containers");
}

export async function signInAsAction(formData: FormData): Promise<void> {
  const userId = text(formData.get("userId"));
  const pin = text(formData.get("pin")).trim();
  const confirm = text(formData.get("confirmPin")).trim();

  const members = await repository().listMembers();
  const member = members.find((m) => m.userId === userId);
  if (!member) redirect("/signin?error=unknown-member");

  const at = `/signin?member=${encodeURIComponent(userId)}`;

  // Checked before the PIN is looked at, so a locked-out attacker learns
  // nothing from the response time either.
  const locked = lockoutMinutes(userId);
  if (locked > 0) redirect(`${at}&error=locked`);

  if (member.hasPin) {
    // Slows down after the free attempts are spent. A person who mistyped
    // once never notices; a script noticing is the point.
    await delayForAttempts(userId);

    const principal = await repository().authenticateMember(userId, pin);
    if (!principal) {
      recordFailure(userId);
      redirect(`${at}&error=bad-pin`);
    }
    await land(principal);
  }

  // First sign-in: this member is choosing their PIN.
  if (pinProblem(pin)) redirect(`${at}&error=weak-pin`);
  // Confirmed, because a typo here is not a failed sign-in — it is a PIN
  // nobody knows, on a member who can no longer enrol.
  if (pin !== confirm) redirect(`${at}&error=mismatch`);

  const principal = await repository().enrolMemberPin(userId, pin);
  // Almost always the race: someone claimed this name between the page
  // rendering and this submit. Re-rendering the screen shows it asking for a
  // PIN instead of offering to set one, which is the honest next step.
  if (!principal) redirect(`${at}&error=already-enrolled`);

  await land(principal);
}

export async function signOutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/signin");
}
