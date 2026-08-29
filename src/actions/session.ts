"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { repository } from "@/db";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Sign-in stub. SCOPE.md §4 specifies Auth.js with Discord OAuth; phase 1
 * replaces the body of these with a real OAuth callback. The cookie shape and
 * the redirect targets are already what the real implementation will use, so
 * that swap touches this file and `src/lib/session.ts` only.
 */

export async function signInAsAction(formData: FormData): Promise<void> {
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
  redirect("/signin");
}
