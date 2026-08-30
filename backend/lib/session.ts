import { cookies } from "next/headers";

import type { Principal } from "@backend/domain/view";
import { repository } from "@backend/db";
import { auth, authConfigured } from "@backend/lib/auth";

/**
 * Session — where identity becomes a principal.
 *
 * The stub this replaces predicted its own shape correctly: everything
 * downstream takes a `Principal` and never asks how it was obtained, so
 * landing real auth changed this file, `backend/lib/auth.ts`, and the sign-in
 * screen — and no component, action or repository method at all.
 *
 * Two paths, chosen by configuration rather than by a build flag:
 *
 *   - **Discord (M1).** `AUTH_DISCORD_ID`/`AUTH_DISCORD_SECRET`/`AUTH_SECRET`
 *     set. Auth.js establishes WHO you are; `findMemberByDiscordId` decides
 *     whether you are in this campaign. A Discord account with no membership
 *     row resolves to no principal, which is what M1's "not in this campaign"
 *     screen is for.
 *   - **Member picker.** Nothing configured. A cookie names a seeded member so
 *     the permission rules can be exercised from every role while building.
 *     This is why `npm run dev` needs neither a database nor a Discord app.
 *
 * The fallback is a development affordance, and the sign-in screen states which
 * path is live rather than leaving it to be inferred. Note that it is reachable
 * only when no Discord credentials exist: once they are set, the cookie stops
 * being consulted, so a stale one cannot be used to bypass OAuth.
 */
const COOKIE = "arca_user";

/**
 * Signed in with Discord, but not at this table.
 *
 * Distinct from "not signed in", because the two need opposite screens: one
 * offers a sign-in button, the other must not — clicking it again produces the
 * same result and reads as a broken login rather than a closed door.
 */
export interface Outsider {
  discordId: string;
  displayName: string;
}

export type SessionState =
  | { kind: "anonymous" }
  | { kind: "member"; principal: Principal }
  | { kind: "outsider"; outsider: Outsider };

export async function currentSession(): Promise<SessionState> {
  if (authConfigured()) {
    const session = await auth();
    const discordId = session?.discordId;
    if (!discordId) return { kind: "anonymous" };

    const principal = await repository().findMemberByDiscordId(discordId);
    if (principal) return { kind: "member", principal };

    return {
      kind: "outsider",
      outsider: {
        discordId,
        displayName: session.user?.name ?? "there",
      },
    };
  }

  const jar = await cookies();
  const userId = jar.get(COOKIE)?.value;
  if (!userId) return { kind: "anonymous" };

  const members = await repository().listMembers();
  const member = members.find((m) => m.userId === userId);
  return member
    ? { kind: "member", principal: member }
    : { kind: "anonymous" };
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
