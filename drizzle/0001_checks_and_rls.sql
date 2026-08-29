-- ============================================================================
-- Arca — invariants the database enforces itself.
--
-- Two things live here that Drizzle's schema cannot express:
--
--   1. CHECK constraints for the container-ownership rule.
--   2. Row-level security, so the permission model has a backstop underneath
--      the application layer (SCOPE.md §10 R7). A route handler that forgets
--      to call assertCanRead returns NOTHING rather than leaking, which is the
--      difference between a bug and an incident.
--
-- IMPORTANT — the policies below are DEFINED but NOT YET LOAD-BEARING.
-- Postgres exempts a table's OWNER from row-level security unless the table is
-- also set to FORCE ROW LEVEL SECURITY, and the app currently connects as the
-- owner. Two things must happen before these policies actually protect
-- anything, and both are phase-1 work (SCOPE.md milestone 1):
--
--   a) Create a non-owner role for the application and connect as that.
--   b) Set the principal on every connection, per transaction:
--        select set_config('arca.user_id', $1, true);
--        select set_config('arca.role',    $2, true);
--
-- Until then the application-layer checks in src/lib/permissions.ts are the
-- only enforcement — which is why those are the ones covered by tests.
-- ============================================================================


-- ── 1. Container ownership ──────────────────────────────────────────────────
-- A character pack with no owner has nobody who may edit it, and an owned party
-- stash is a contradiction. Zod says the same thing in src/domain/types.ts; this
-- is the backstop, that one is the error message a human reads.

ALTER TABLE "containers"
  ADD CONSTRAINT "containers_ownership_check"
  CHECK (
    (type = 'character' AND owner_id IS NOT NULL)
    OR
    (type <> 'character' AND owner_id IS NULL)
  );
--> statement-breakpoint

-- Only world containers are gated behind a reveal. A character pack or the
-- party wagon being "unrevealed" is meaningless and would silently hide loot.
ALTER TABLE "containers"
  ADD CONSTRAINT "containers_revealed_check"
  CHECK (type = 'world' OR revealed = true);
--> statement-breakpoint

-- Quantities are positive. Removing the last one is an archive, not a zero —
-- a zero-quantity row is an item that exists nowhere, which nothing in the UI
-- can render honestly.
ALTER TABLE "object_properties"
  ADD CONSTRAINT "object_properties_qty_positive_check"
  CHECK (
    NOT (
      jsonb_typeof(value) = 'number'
      AND value::numeric < 0
    )
  );
--> statement-breakpoint


-- ── 2. The principal ────────────────────────────────────────────────────────
-- The application sets these per connection before running a query:
--
--     select set_config('arca.user_id', $1, true);
--     select set_config('arca.role',    $2, true);
--
-- `true` makes them transaction-local, so a pooled connection cannot carry one
-- player's identity into the next request. This is Coda's volatile User()
-- expressed in Postgres: one policy, evaluated per viewer.

CREATE OR REPLACE FUNCTION arca_current_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('arca.user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION arca_is_gm() RETURNS boolean AS $$
  SELECT COALESCE(current_setting('arca.role', true) = 'gm', false);
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

-- Readable: the GM sees everything; a player sees their own packs, every party
-- container, and a world container only once it is revealed.
CREATE OR REPLACE FUNCTION arca_can_read_container(container_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM containers c
    WHERE c.object_id = container_id
      AND (
        arca_is_gm()
        OR (c.type = 'character' AND c.owner_id = arca_current_user_id())
        OR c.type = 'party'
        OR (c.type = 'world' AND c.revealed)
      )
  );
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

-- Writable is deliberately narrower than readable: a player can SEE the Barrow
-- Chest once it is revealed, but taking from it is still the GM's call.
CREATE OR REPLACE FUNCTION arca_can_write_container(container_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM containers c
    WHERE c.object_id = container_id
      AND (
        arca_is_gm()
        OR (c.type = 'character' AND c.owner_id = arca_current_user_id())
        OR c.type = 'party'
      )
  );
$$ LANGUAGE sql STABLE;
--> statement-breakpoint


-- ── 3. Policies ─────────────────────────────────────────────────────────────

ALTER TABLE "containers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "containers_read" ON "containers"
  FOR SELECT USING (arca_can_read_container(object_id));
--> statement-breakpoint
CREATE POLICY "containers_write" ON "containers"
  FOR ALL USING (arca_can_write_container(object_id))
  WITH CHECK (arca_can_write_container(object_id));
--> statement-breakpoint

-- The containment edge is where an item's visibility is decided, because an
-- item has no location of its own — it has an edge.
ALTER TABLE "container_objects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "container_objects_read" ON "container_objects"
  FOR SELECT USING (arca_can_read_container(container_id));
--> statement-breakpoint
CREATE POLICY "container_objects_write" ON "container_objects"
  FOR ALL USING (arca_can_write_container(container_id))
  WITH CHECK (arca_can_write_container(container_id));
--> statement-breakpoint

-- An object is visible if ANY edge that holds it is readable. A container an
-- item is not in cannot make it visible, and an item with no edge at all is
-- visible only to the GM.
ALTER TABLE "objects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "objects_read" ON "objects"
  FOR SELECT USING (
    arca_is_gm()
    OR EXISTS (
      SELECT 1 FROM container_objects co
      WHERE co.object_id = objects.id
        AND arca_can_read_container(co.container_id)
    )
    OR EXISTS (
      SELECT 1 FROM containers c WHERE c.object_id = objects.id
    )
  );
--> statement-breakpoint
CREATE POLICY "objects_write" ON "objects"
  FOR ALL USING (
    arca_is_gm()
    OR EXISTS (
      SELECT 1 FROM container_objects co
      WHERE co.object_id = objects.id
        AND arca_can_write_container(co.container_id)
    )
  )
  WITH CHECK (true);
--> statement-breakpoint

-- Property values follow their object. This is the row that would leak the
-- contents of a sealed vault if it were left unguarded.
ALTER TABLE "object_properties" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "object_properties_read" ON "object_properties"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM objects o WHERE o.id = object_properties.object_id)
  );
--> statement-breakpoint
CREATE POLICY "object_properties_write" ON "object_properties"
  FOR ALL USING (
    arca_is_gm()
    OR EXISTS (
      SELECT 1 FROM container_objects co
      WHERE co.object_id = object_properties.object_id
        AND arca_can_write_container(co.container_id)
    )
    OR EXISTS (
      SELECT 1 FROM containers c WHERE c.object_id = object_properties.object_id
    )
  )
  WITH CHECK (true);
--> statement-breakpoint

ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "comments_read" ON "comments"
  FOR SELECT USING (arca_can_read_container(container_id));
--> statement-breakpoint
CREATE POLICY "comments_write" ON "comments"
  FOR ALL USING (arca_can_write_container(container_id))
  WITH CHECK (arca_can_write_container(container_id));
--> statement-breakpoint


-- ── 4. Live sync ────────────────────────────────────────────────────────────
-- Every write announces itself on a channel. The listener — an SSE route on the
-- Node runtime — is NOT built yet: realtime is the phase-0 spike and the
-- biggest technical unknown in the project (SCOPE.md §10 R1). The trigger is
-- installed now so that the spike has something to listen to on day one.
--
-- NOTIFY is the mechanism, not the guarantee: it is fire-and-forget and does
-- not survive a dropped listener, which is why the client reconciles against a
-- fetch rather than treating the event as authoritative.

CREATE OR REPLACE FUNCTION arca_notify_change() RETURNS trigger AS $$
DECLARE
  payload text;
BEGIN
  payload := json_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'at', extract(epoch from now())
  )::text;
  PERFORM pg_notify('arca_changes', payload);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER "container_objects_notify"
  AFTER INSERT OR UPDATE OR DELETE ON "container_objects"
  FOR EACH STATEMENT EXECUTE FUNCTION arca_notify_change();
--> statement-breakpoint

CREATE TRIGGER "object_properties_notify"
  AFTER INSERT OR UPDATE OR DELETE ON "object_properties"
  FOR EACH STATEMENT EXECUTE FUNCTION arca_notify_change();
--> statement-breakpoint

CREATE TRIGGER "objects_notify"
  AFTER INSERT OR UPDATE OR DELETE ON "objects"
  FOR EACH STATEMENT EXECUTE FUNCTION arca_notify_change();
