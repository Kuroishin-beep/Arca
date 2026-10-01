/**
 * Which campaign a piece of work belongs to.
 *
 * A deployment can hold many campaigns; each person works in one at a time,
 * chosen with the campaign menu. Rather than thread a campaign id through every
 * repository signature (and every query inside them), the repository runs each
 * call inside the caller's campaign — see `scopedRepository` in
 * `backend/db/index.ts` — and anything that needs the id asks this module.
 *
 * Outside any campaign scope (seeding, sign-up, scripts) the answer is the
 * deployment's default campaign, which is what every call meant before there
 * was more than one.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { CAMPAIGN_ID } from "@backend/db/seed-data";

interface CampaignScope {
  campaignId: string;
}

// One instance per process, even if this module is evaluated more than once
// (Next can load server modules into separate bundles).
const KEY = Symbol.for("arca.campaign.scope");
const scope: AsyncLocalStorage<CampaignScope> = ((
  globalThis as unknown as Record<symbol, AsyncLocalStorage<CampaignScope> | undefined>
)[KEY] ??= new AsyncLocalStorage<CampaignScope>());

/** The deployment's default campaign: where sign-ups land, and the seed. */
export function defaultCampaignId(): string {
  return process.env.ARCA_CAMPAIGN_ID ?? CAMPAIGN_ID;
}

/** The campaign the current work belongs to. */
export function campaignId(): string {
  return scope.getStore()?.campaignId ?? defaultCampaignId();
}

/** Run `work` inside a campaign: every `campaignId()` it reaches, however
 *  deep and however many awaits later, answers `id`. */
export function inCampaign<T>(id: string, work: () => T): T {
  return scope.run({ campaignId: id }, work);
}

/** The campaign a principal is working in — what actions use for the live
 *  channel, which is per campaign. */
export function campaignOf(principal: { campaignId?: string }): string {
  return principal.campaignId ?? defaultCampaignId();
}
