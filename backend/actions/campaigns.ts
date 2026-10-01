"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { repository } from "@backend/db";
import { CreateCampaignInput } from "@backend/domain/view";
import { CAMPAIGN_SESSION_COOKIE, requirePrincipal } from "@backend/lib/session";

/**
 * Campaigns — the menu on the campaign name in the sidebar.
 *
 * Which campaign someone is working in is a cookie the session reads, and it
 * grants nothing on its own: `currentSession` checks membership of the
 * campaign it names on every request, and ignores one they are not in. So
 * switching only has to write the cookie; the checks are where they always
 * were.
 */

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  // The Symbiote loads Arca in an iframe, so a secure cookie is required in
  // production for it to be sent at all — the same reason as the session's.
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

/** FormData values are `string | File`; anything not text is treated as absent. */
function text(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

export async function switchCampaignAction(formData: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const wanted = text(formData.get("campaignId"));

  // Only to a campaign they are in. The session would ignore anything else
  // anyway; refusing here keeps a bad id from sitting in the cookie.
  const seats = await repository().membershipsOf(principal.userId);
  if (seats.some((s) => s.campaignId === wanted)) {
    const jar = await cookies();
    jar.set(CAMPAIGN_SESSION_COOKIE, wanted, COOKIE_OPTIONS);
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function createCampaignAction(formData: FormData): Promise<void> {
  const principal = await requirePrincipal();
  const parsed = CreateCampaignInput.safeParse({ name: text(formData.get("name")) });
  if (!parsed.success) {
    const name = encodeURIComponent(text(formData.get("name")));
    redirect(`/campaigns/new?error=name&name=${name}`);
  }

  const created = await repository().createCampaign(principal, parsed.data);

  // Straight into it — a new campaign is where the next step happens.
  const jar = await cookies();
  jar.set(CAMPAIGN_SESSION_COOKIE, created.campaignId, COOKIE_OPTIONS);

  revalidatePath("/", "layout");
  redirect("/");
}
