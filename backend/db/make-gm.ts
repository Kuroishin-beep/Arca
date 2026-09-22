/**
 * Make one account the GM of this campaign — without reseeding.
 *
 *   ARCA_GM_EMAIL=you@example.com DATABASE_URL=... npx tsx backend/db/make-gm.ts [displayName]
 *
 * `npm run db:seed` would also produce a GM, but it DELETES the campaign
 * first, which is not something to run against a deployment people are using.
 * This only ever inserts or updates two rows:
 *
 *  - the user, created if the address is new (unenrolled: they choose their
 *    password on first sign-in, like every member), otherwise left as it is
 *    apart from the display name;
 *  - their campaign membership, set to `gm`.
 *
 * Nothing is deleted and no other member's role is touched. Running it twice
 * is the same as running it once. The address comes from the environment, not
 * an argument or a file, because this repository is public.
 */
import { and, eq } from "drizzle-orm";

import { db, rawSql } from "./client";
import { campaignMembers, campaigns, users } from "./schema";
import { campaignId } from "@backend/lib/campaign";

async function main(): Promise<void> {
  const email = process.env.ARCA_GM_EMAIL?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Set ARCA_GM_EMAIL to the address that should be GM.");
  }
  const displayName = process.argv[2]?.trim() || "Xen";

  const campaign = await db()
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId()));
  if (!campaign[0]) {
    throw new Error(`No campaign ${campaignId()} in this database — has it been seeded?`);
  }

  const existing = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));

  const userId =
    existing[0]?.id ??
    (
      await db()
        .insert(users)
        .values({ email, displayName })
        .returning({ id: users.id })
    )[0]!.id;

  if (existing[0]) {
    await db().update(users).set({ displayName }).where(eq(users.id, userId));
  }

  await db()
    .insert(campaignMembers)
    .values({ campaignId: campaign[0].id, userId, role: "gm" })
    .onConflictDoUpdate({
      target: [campaignMembers.campaignId, campaignMembers.userId],
      set: { role: "gm" },
    });

  const check = await db()
    .select({ role: campaignMembers.role })
    .from(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, campaign[0].id),
        eq(campaignMembers.userId, userId),
      ),
    );

  process.stdout.write(
    `${displayName} is ${check[0]?.role} of "${campaign[0].name}"` +
      `${existing[0] ? "" : " (new account — choose a password on first sign-in)"}.\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => rawSql().end());
