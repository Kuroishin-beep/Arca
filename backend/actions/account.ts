"use server";

import { redirect } from "next/navigation";

import { repository } from "@backend/db";
import {
  delayForAttempts,
  emailProblem,
  lockoutMinutes,
  normaliseEmail,
  passwordProblem,
  recordFailure,
} from "@backend/lib/password";
import { requirePrincipal } from "@backend/lib/session";

function text(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

/**
 * "I forgot my password." Marks the account for its GM, who resets it from
 * the roster; the player then sets a new one with "First time signing in?".
 *
 * Always lands on the same "sent" message, known address or not — the form
 * must not be a way to ask who has an account. Throttled per address like a
 * sign-in, so it cannot be used to spam a GM's roster.
 */
export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const email = normaliseEmail(text(formData.get("email")));
  if (emailProblem(email)) {
    redirect(`/forgot?error=bad-email&email=${encodeURIComponent(email)}`);
  }
  // Its own throttle key: counted against the SIGN-IN key, ten requests from
  // a stranger would lock the real owner out of their own account.
  const key = `reset:${email}`;
  if (lockoutMinutes(key) > 0) redirect("/forgot?error=locked");
  await delayForAttempts(key);
  recordFailure(key);

  await repository().requestPasswordReset(email);
  redirect("/forgot?sent=1");
}

/** A signed-in member changes their own password, knowing the current one. */
export async function changePasswordAction(formData: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const current = text(formData.get("currentPassword"));
  const next = text(formData.get("newPassword"));
  const confirm = text(formData.get("confirmPassword"));

  if (lockoutMinutes(principal.email) > 0) redirect("/account?error=locked");
  if (passwordProblem(next, principal.email)) redirect("/account?error=weak-password");
  if (next !== confirm) redirect("/account?error=mismatch");

  await delayForAttempts(principal.email);
  if (!(await repository().changePassword(principal, current, next))) {
    recordFailure(principal.email);
    redirect("/account?error=wrong-password");
  }
  redirect("/account?changed=1");
}
