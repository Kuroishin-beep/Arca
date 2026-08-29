/**
 * Which campaign this deployment serves.
 *
 * One campaign per deployment for now — SCOPE.md §13 Q5 is still open, and
 * hard-coding it here rather than threading it through every signature means
 * answering "a switcher, actually" later changes this file and the call sites,
 * not the shape of the domain.
 */
import { CAMPAIGN_ID } from "@/db/seed-data";

export function campaignId(): string {
  return process.env.ARCA_CAMPAIGN_ID ?? CAMPAIGN_ID;
}
