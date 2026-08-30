-- Sign-in moves from Discord OAuth to a per-member PIN.
--
-- DROP and ADD rather than a rename, deliberately. A Discord id and a scrypt
-- hash are not the same value wearing two names: renaming the column would
-- leave every existing row holding a Discord id in a column the application
-- now reads as a password hash, and `verifyPin` would return false for every
-- member forever while `hasPin` reported true — a table nobody can sign in to,
-- and no error anywhere saying why.
--
-- Dropping it means every member is unenrolled after this migration and
-- chooses a PIN on their next sign-in, which is the intended first-run flow
-- (backend/lib/pin.ts). Nothing else in the campaign is touched: containers,
-- items, containment edges and comments all key off `users.id`, which does not
-- change.
--
-- The unique index goes with the column. Nothing replaces it: two members may
-- legitimately pick the same PIN, and a unique index over `pin_hash` would
-- both leak that fact and refuse the second one at random.

DROP INDEX IF EXISTS "users_discord_id_key";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "discord_id";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pin_hash" text;
