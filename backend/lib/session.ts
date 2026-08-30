import { cookies } from "next/headers";

import type { Principal } from "@backend/domain/view";
import { repository } from "@backend/db";

/**
 * Session — where identity becomes a principal.
 *
 * Everything downstream takes a `Principal` and never asks how it was
 * obtained, which is why replacing the sign-in mechanism touched this file,
 * `backend/actions/session.ts` and the sign-in screen, and no component,
 * action or repository method at all.
 *
 * One path: a member picks their name from the campaign's roster and proves it
 * with a PIN (`backend/lib/pin.ts`). Six people at one table on a shared link
 * do not need accounts, and the PIN is what stops the roster from being a list
 * of names anyone holding the link can sit down as.
 *
 * The cookie holds a user id and nothing else — no role, no expiry claim of its
 * own. Role is read from `campaign_members` on every request, so a GM changing
 * someone's role takes effect on their next click rather than whenever a token
 * would have expired. A cookie naming someone who has since been removed from
 * the campaign resolves to no principal, which is the same closed door as never
 * having signed in.
 */
const COOKIE = "arca_user";

export type SessionState =
  | { kind: "anonymous" }
  | { kind: "member"; principal: Principal };

export async function currentSession(): Promise<SessionState> {
  const jar = await cookies();
  const userId = jar.get(COOKIE)?.value;
  if (!userId) return { kind: "anonymous" };

  // Re-resolved against the roster on every request rather than trusted from
  // the cookie: this is the check that makes removing someone from the
  // campaign take effect immediately.
  const members = await repository().listMembers();
  const member = members.find((m) => m.userId === userId);
  if (!member) return { kind: "anonymous" };

  return {
    kind: "member",
    principal: {
      userId: member.userId,
      displayName: member.displayName,
      role: member.role,
    },
  };
}

export async function currentPrincipal(): Promise<Principal | null> {
  const state = await currentSession();
  return state.kind === "member" ? state.principal : null;
}

/** Throws rather than returning null: every app route requires a principal, and
 *  a route that forgets to check should fail loudly, not render an empty page. */
export async function requirePrincipal(): Promise<Principal> {
  const principal = await currentPrincipal();
  if (!principal) throw new Error("Not signed in.");
  return principal;
}

export const SESSION_COOKIE = COOKIE;
