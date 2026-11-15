"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { repository } from "@backend/db";
import { ConflictError } from "@backend/db/repository";
import { PermissionError } from "@backend/lib/permissions";
import { CAMPAIGN_SESSION_COOKIE, requirePrincipal } from "@backend/lib/session";

/** TaleSpire's campaign ids are opaque strings; this only bounds them. */
const TaleSpireId = z.string().trim().min(1).max(200);

const CAMPAIGN_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export type TaleSpireSync =
  /** Switched to the linked Arca campaign; the page should reload from "/". */
  | { kind: "switched" }
  /** Already in the linked campaign, or nothing to do. */
  | { kind: "in-place" }
  /** No Arca campaign of yours is linked, and you may link this one. */
  | { kind: "offer-link"; arcaCampaignName: string };

/**
 * Called by the Symbiote when it opens inside a TaleSpire campaign.
 *
 * If one of this player's Arca campaigns is linked to it, switch to that
 * campaign — the same cookie the campaign menu sets. Never to a campaign they
 * are not a member of: `campaignForTaleSpire` only looks among their seats.
 * Otherwise, a GM is offered the link for the campaign they are in.
 */
export async function syncTaleSpireCampaignAction(talespireId: string): Promise<TaleSpireSync> {
  const principal = await requirePrincipal();
  const parsed = TaleSpireId.safeParse(talespireId);
  if (!parsed.success) return { kind: "in-place" };

  const repo = repository();
  const linked = await repo.campaignForTaleSpire(principal.userId, parsed.data);
  if (linked) {
    if (linked === principal.campaignId) return { kind: "in-place" };
    // No revalidatePath: the client reloads from "/" in full, and re-rendering
    // the current address under the new campaign would only flash "No such
    // container" before that.
    (await cookies()).set(CAMPAIGN_SESSION_COOKIE, linked, CAMPAIGN_COOKIE_OPTIONS);
    return { kind: "switched" };
  }

  // Unlinked. Offer it only to a GM, and only for a campaign not already
  // linked to some other TaleSpire campaign (that would silently re-point it).
  if (principal.role !== "gm") return { kind: "in-place" };
  if ((await repo.taleSpireLinkOf(principal)) !== null) return { kind: "in-place" };
  return { kind: "offer-link", arcaCampaignName: principal.campaignName ?? "this campaign" };
}

export async function linkTaleSpireCampaignAction(
  talespireId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const principal = await requirePrincipal();
    const parsed = TaleSpireId.safeParse(talespireId);
    if (!parsed.success) return { ok: false, error: "TaleSpire did not say which campaign this is." };
    await repository().linkTaleSpireCampaign(principal, parsed.data);
    return { ok: true };
  } catch (error) {
    if (error instanceof PermissionError || error instanceof ConflictError) {
      return { ok: false, error: error.message };
    }
    console.error("[arca] linking TaleSpire campaign failed", error);
    return { ok: false, error: "Could not link this campaign." };
  }
}
