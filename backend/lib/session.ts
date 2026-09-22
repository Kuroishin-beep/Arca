import { cookies } from "next/headers";

import type { Principal } from "@backend/domain/view";
import { repository } from "@backend/db";

import { sessionSecret, verifySession } from "./session-token";

/**
 * Session — where identity becomes a principal.
 *
 * Everything downstream takes a `Principal` and never asks how it was
 * obtained, which is why replacing the sign-in mechanism touched this file,
 * `backend/actions/session.ts` and the sign-in screen, and no component,
 * action or repository method at all.
 *
 * One path: a member types their email address and their password
 * (`backend/lib/password.ts`). The address is the identity — it is what the
 * roster is keyed by and what the UI attributes a comment to — and the password
 * is what stops anyone holding the link from sitting down as the GM.
 *
 * The cookie holds a user id and an HMAC over it (`session-token.ts`) — no
 * role, no expiry claim of its own. The id is not secret; the signature is what
 * stops a visitor from writing someone else's into their own cookie, which is
 * exactly what the unsigned version allowed. Role is read from
 * `campaign_members` on every request, so a GM changing
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
  // Verified, not read. This used to take the cookie's value as the user id,
  // and a cookie is something the visitor writes — so anyone who set
  // `arca_user` to the GM's seeded id (it is in the public seed file) WAS the
  // GM, with no password. `verifySession` returns an id only if we signed it.
  const userId = verifySession(jar.get(COOKIE)?.value, sessionSecret());
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
      email: member.email,
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
