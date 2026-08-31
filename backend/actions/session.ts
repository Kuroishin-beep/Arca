"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { repository } from "@backend/db";
import type { Principal } from "@backend/domain/view";
import {
  delayForAttempts,
  emailProblem,
  lockoutMinutes,
  normaliseEmail,
  passwordProblem,
  recordFailure,
} from "@backend/lib/password";
import { SESSION_COOKIE } from "@backend/lib/session";

/**
 * Sign in and out.
 *
 * One mechanism: type the email address the GM has for you, and your password.
 * A member who has not chosen a password yet chooses one here on their first
 * sign-in, which is why this action covers both cases rather than splitting
 * into two.
 *
 * That single form is a deliberate answer to a leak the old two-step roster had
 * to live with. Splitting it — submit the address, then be shown either "enter
 * your password" or "choose a password" — would make the screen an oracle for
 * which addresses are at this table, one query at a time. Here the confirm
 * field is always rendered and only ever consulted while enrolling, so the
 * page looks the same for an address that is at the table, one that is not, and
 * one that is but has already signed in.
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

/** Everything after a successful sign-in, shared by both paths below. */
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
  const email = normaliseEmail(text(formData.get("email")));
  const password = text(formData.get("password"));
  const confirm = text(formData.get("confirmPassword"));

  // The typed address is echoed back so a wrong password does not also cost
  // retyping the email. It is the one field on this form that is not a secret.
  const at = `/signin?email=${encodeURIComponent(email)}`;

  if (emailProblem(email)) redirect(`${at}&error=bad-email`);

  // Checked before the password is looked at, so a locked-out attacker learns
  // nothing from the response time either.
  const locked = lockoutMinutes(email);
  if (locked > 0) redirect(`${at}&error=locked`);

  // Slows down after the free attempts are spent. A person who mistyped once
  // never notices; a script noticing is the point.
  await delayForAttempts(email);

  // Tried first, and unconditionally. An address with a password set never
  // reaches the enrolment branch below, so enrolment cannot be used to
  // overwrite one — and the two branches cost the same lookup, so which one ran
  // is not visible in the timing.
  const existing = await repository().authenticateMember(email, password);
  if (existing) await land(existing);

  // Past this point the sign-in did not succeed, and the reason is one of:
  // wrong password, no password set yet, or no such address. The three are
  // answered identically.
  //
  // The confirm field is what selects the branch, NOT whether the member is
  // enrolled — asking the repository that and reporting it is exactly the
  // oracle this form is shaped to avoid. Someone signing in normally leaves it
  // empty and gets the wrong-credentials answer; someone signing in for the
  // first time fills it, which is what the field's label asks for.
  if (confirm === "") {
    recordFailure(email);
    redirect(`${at}&error=bad-credentials`);
  }

  // Confirmed, because a typo here is not a failed sign-in — it is a password
  // nobody knows, on a member who can no longer enrol.
  if (password !== confirm) redirect(`${at}&error=mismatch`);

  // Checked before enrolling, so a first sign-in cannot set something shorter
  // than the form advertises.
  if (passwordProblem(password, email)) {
    recordFailure(email);
    redirect(`${at}&error=weak-password`);
  }

  const enrolled = await repository().enrolMemberPassword(email, password);
  if (!enrolled) {
    // Unknown address, or one that was enrolled between the two calls above.
    // Both are reported as the same wrong-credentials message: saying "no such
    // member" here is what would turn this form into a roster oracle.
    recordFailure(email);
    redirect(`${at}&error=bad-credentials`);
  }

  await land(enrolled);
}

export async function signOutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/signin");
}
