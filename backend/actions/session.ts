"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { repository } from "@backend/db";
import {
  authConfigured,
  signIn as authSignIn,
  signOut as authSignOut,
} from "@backend/lib/auth";
import { SESSION_COOKIE } from "@backend/lib/session";

/**
 * Sign in and out.
 *
 * `signOutAction` has to clear BOTH mechanisms rather than branching on the
 * current one. A deployment that gains Discord credentials still has member-
 * picker cookies in people's browsers, and a sign-out that left one behind
 * would look like it had not worked at all.
 */

export async function signInWithDiscordAction(): Promise<void> {
  await authSignIn("discord", { redirectTo: "/" });
}

/** The member picker. Reachable only while Discord is unconfigured — see the
 *  note in `backend/lib/session.ts`. */
export async function signInAsAction(formData: FormData): Promise<void> {
  if (authConfigured()) redirect("/signin");

  const userId = String(formData.get("userId") ?? "");
  const members = await repository().listMembers();
  const member = members.find((m) => m.userId === userId);
  if (!member) redirect("/signin?error=unknown-member");

  const jar = await cookies();
  jar.set(SESSION_COOKIE, member.userId, {
    httpOnly: true,
    sameSite: "lax",
    // The Symbiote loads Arca in an iframe, so a secure cookie is required in
    // production for it to be sent at all.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  const containers = await repository().listContainers(member);
  const landing = containers.find((c) => c.type === "party") ?? containers[0];
  redirect(landing ? `/c/${landing.id}` : "/signin?error=no-containers");
}

export async function signOutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);

  if (authConfigured()) {
    // Redirects on its own, so nothing below it runs.
    await authSignOut({ redirectTo: "/signin" });
    return;
  }
  redirect("/signin");
}
