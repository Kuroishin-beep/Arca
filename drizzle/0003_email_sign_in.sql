-- Sign-in moves from a name picker plus a PIN to an email address plus a
-- password.
--
-- Two separate changes that have to happen together, because the sign-in form
-- reads both columns in one submit.
--
-- 1. `email` is added NOT NULL, so it needs a value for every row that already
--    exists. There is nothing in the database to derive a real address from —
--    a display name is not an email — so the backfill mints a placeholder in
--    the reserved `.invalid` TLD (RFC 2606), which is guaranteed never to
--    resolve. That is the point: a placeholder that looks like a working
--    address is one somebody eventually sends mail to.
--
--    The GM edits these to real addresses. Until then a member signs in with
--    the placeholder, which is unguessable-adjacent rather than secret and is
--    exactly as trustworthy as the display name it was built from — which is
--    why the password below is what actually gates the seat.
--
--    `regexp_replace` keeps the local part to characters an address may hold,
--    and the id suffix keeps two members named "Kova" from colliding on the
--    unique index.
--
-- 2. `pin_hash` is DROPPED and `password_hash` ADDED, rather than renamed. A
--    four-digit PIN hash is a valid scrypt record, so a rename would leave
--    every member able to sign in with their old PIN under a form that now
--    advertises an eight-character minimum — the weaker credential silently
--    surviving the change that was supposed to replace it. Dropping it puts
--    every member back at "choose a password", which is the intended first-run
--    flow (backend/lib/password.ts).
--
-- Nothing else in the campaign is touched: containers, items, containment
-- edges and comments all key off `users.id`, which does not change.

ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint

UPDATE "users"
SET "email" =
  regexp_replace(lower("display_name"), '[^a-z0-9._-]+', '.', 'g')
  || '.' || substr("id"::text, 1, 8)
  || '@arca.invalid'
WHERE "email" IS NULL;--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint

-- Unique because the email IS the identity now: two rows sharing one makes
-- "which member is this?" unanswerable at the one moment it has to be.
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");--> statement-breakpoint

ALTER TABLE "users" DROP COLUMN IF EXISTS "pin_hash";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;
