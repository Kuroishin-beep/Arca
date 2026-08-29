import { cookies } from "next/headers";

import type { Principal } from "@/domain/view";
import { repository } from "@/db";

/**
 * Session — deliberately a stub.
 *
 * SCOPE.md §4 specifies Auth.js with Discord OAuth, and phase 1 will replace
 * the body of these two functions with a real session lookup. Until then the
 * sign-in screen writes a member id into a cookie so the app can be driven as
 * a GM or as either player, which is exactly what is needed to exercise the
 * permission rules while the UI is being built.
 *
 * The important part is the SHAPE: everything downstream takes a `Principal`
 * and never asks how it was obtained, so swapping in real auth touches this
 * file and nothing else.
 *
 * A cookie is used rather than in-memory state because the Symbiote's embedded
 * browser loses in-memory state on a hard refresh (SCOPE.md §4.1).
 */
const COOKIE = "arca_user";

export async function currentPrincipal(): Promise<Principal | null> {
  const jar = await cookies();
  const userId = jar.get(COOKIE)?.value;
  if (!userId) return null;

  const members = await repository().listMembers();
  return members.find((m) => m.userId === userId) ?? null;
}

/** Throws rather than returning null: every app route requires a principal, and
 *  a route that forgets to check should fail loudly, not render an empty page. */
export async function requirePrincipal(): Promise<Principal> {
  const principal = await currentPrincipal();
  if (!principal) throw new Error("Not signed in.");
  return principal;
}

export const SESSION_COOKIE = COOKIE;
