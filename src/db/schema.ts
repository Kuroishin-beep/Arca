/**
 * Arca — PostgreSQL schema.
 *
 * A direct implementation of `object_oriented_pkm_core_schema.md`, kept whole
 * rather than flattened. The four rules it hangs from (SCOPE.md §5.1):
 *
 *   1. Object identity is independent of location. Moving an item never
 *      changes its id — which is why `objects` has NO container column.
 *   2. Containers hold references, not copies.
 *   3. Containment is many-to-many and ordered.
 *   4. Views own presentation only.
 *
 * The UI never sees this shape. `src/db/queries.ts` projects it down to the
 * flat `Item` in `src/domain/types.ts`, so the storage model can evolve without
 * touching a component (schema doc rule 10).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const userRoleEnum = pgEnum("user_role", ["gm", "player"]);

/**
 * `character` — a player's own pack, owned by exactly one user.
 * `party`     — the shared wagon or stash, owned by nobody, writable by all.
 * `world`     — a dungeon chest or vault, owned by nobody, GM-gated.
 */
export const containerTypeEnum = pgEnum("container_type", [
  "character",
  "party",
  "world",
]);

export const viewTypeEnum = pgEnum("view_type", [
  "table",
  "cards",
  "grouped",
]);

/* ------------------------------------------------------------------ *
 * Campaign and membership
 *
 * Not in the schema document — that models a single-user PKM. Arca is a
 * shared table, so every read is evaluated against a principal
 * (SCOPE.md §3), and the principal is a membership row.
 * ------------------------------------------------------------------ */

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name").notNull(),
    /** Discord's user id. The campaign already runs on Discord, so there is no
     *  new account to create (SCOPE.md §4). */
    discordId: text("discord_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_discord_id_key").on(t.discordId)],
);

export const campaignMembers = pgTable(
  "campaign_members",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.userId] }),
    index("campaign_members_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ *
 * Objects — the fundamental persistent entity
 * ------------------------------------------------------------------ */

/**
 * Note what is absent: there is no `container_id`. Location is a containment
 * edge, and that single omission is what makes a move a one-row write instead
 * of a remove-and-append across two collections.
 *
 * `archivedAt` is the soft delete. Nothing in Arca is ever hard-deleted — a
 * player needs to be able to undo a mis-tap mid-session (SCOPE.md M6).
 */
export const objects = pgTable(
  "objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("objects_campaign_idx").on(t.campaignId),
    // Almost every read filters archived rows out; a partial index keeps the
    // live set cheap without penalising the archive.
    index("objects_live_idx")
      .on(t.campaignId)
      .where(sql`${t.archivedAt} is null`),
  ],
);

/* ------------------------------------------------------------------ *
 * Types — composable, not inherited
 * ------------------------------------------------------------------ */

/**
 * Capacities is single-type; this is not. `Longsword` is Weapon + Physical
 * Object + Equipment simultaneously (schema doc §5.1), so type membership is a
 * join table rather than a column.
 *
 * `nameSingular` / `namePlural` are stored because the type name is part of the
 * UI grammar — "3 Weapons", "New Weapon" — not just a label.
 */
export const objectTypes = pgTable(
  "object_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    nameSingular: text("name_singular").notNull(),
    namePlural: text("name_plural").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("object_types_name_key").on(t.campaignId, t.nameSingular),
  ],
);

export const objectTypeMemberships = pgTable(
  "object_type_memberships",
  {
    objectId: uuid("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    typeId: uuid("type_id")
      .notNull()
      .references(() => objectTypes.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.objectId, t.typeId] }),
    index("object_type_memberships_type_idx").on(t.typeId),
  ],
);

/* ------------------------------------------------------------------ *
 * Properties — defined on the type, valued on the object
 * ------------------------------------------------------------------ */

/** Schema metadata, not a value. The Capacities property-type list. */
export const propertyDefinitions = pgTable(
  "property_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dataType: text("data_type").notNull(),
    description: text("description").notNull().default(""),
    config: jsonb("config").notNull().default({}),
  },
  (t) => [
    uniqueIndex("property_definitions_name_key").on(t.campaignId, t.name),
  ],
);

export const typeProperties = pgTable(
  "type_properties",
  {
    typeId: uuid("type_id")
      .notNull()
      .references(() => objectTypes.id, { onDelete: "cascade" }),
    propertyDefinitionId: uuid("property_definition_id")
      .notNull()
      .references(() => propertyDefinitions.id, { onDelete: "cascade" }),
    required: boolean("required").notNull().default(false),
    defaultValue: jsonb("default_value"),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.typeId, t.propertyDefinitionId] })],
);

/**
 * JSONB so a user-defined property does not require a migration
 * (schema doc §11). The four hot fields (name, qty, weight, value) are read
 * through the projection in `queries.ts`, which is where the GIN index below
 * earns its keep.
 */
export const objectProperties = pgTable(
  "object_properties",
  {
    objectId: uuid("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    propertyDefinitionId: uuid("property_definition_id")
      .notNull()
      .references(() => propertyDefinitions.id, { onDelete: "cascade" }),
    value: jsonb("value"),
  },
  (t) => [
    primaryKey({ columns: [t.objectId, t.propertyDefinitionId] }),
    index("object_properties_value_idx").using("gin", t.value),
  ],
);

/* ------------------------------------------------------------------ *
 * Relations — arbitrary object-to-object meaning
 * ------------------------------------------------------------------ */

/**
 * Distinct from containment on purpose. Containment means "is in"; a relation
 * means anything else — `Longsword —crafted_by→ Blacksmith` (schema doc §6).
 * Collapsing the two is the mistake that makes "which bag is the blacksmith
 * in?" a queryable question.
 */
export const relationTypes = pgTable("relation_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
});

export const objectRelations = pgTable(
  "object_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceObjectId: uuid("source_object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    relationTypeId: uuid("relation_type_id")
      .notNull()
      .references(() => relationTypes.id, { onDelete: "cascade" }),
    targetObjectId: uuid("target_object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Traversable from both endpoints — Coda's linked two-way relations.
    index("object_relations_source_idx").on(t.sourceObjectId),
    index("object_relations_target_idx").on(t.targetObjectId),
  ],
);

/* ------------------------------------------------------------------ *
 * Containers and containment
 * ------------------------------------------------------------------ */

/**
 * A Container IS an Object with container capability — hence the PK being a FK
 * to `objects` rather than an independent id (schema doc §7.1). That is what
 * lets a chest be put inside a wagon later without a new table.
 */
export const containers = pgTable(
  "containers",
  {
    objectId: uuid("object_id")
      .primaryKey()
      .references(() => objects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: containerTypeEnum("type").notNull(),
    /** NULL for party and world. Enforced by the CHECK constraint added in the
     *  migration: a character pack with no owner has nobody who may edit it,
     *  and an owned party stash is a contradiction. */
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** World containers only: a player sees one once the GM reveals it. */
    revealed: boolean("revealed").notNull().default(false),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("containers_owner_idx").on(t.ownerId)],
);

/**
 * THE table. Every headline interaction in Arca is a write here.
 *
 * `position` carries manual ordering — Capacities' Collection, membership by
 * hand, as opposed to a View's membership by rule.
 *
 * `metadata` is edge-local: "equipped in main hand" belongs to the
 * item-in-this-container, not to the item. The axe is one object whether it is
 * on a belt or in the wagon.
 */
export const containerObjects = pgTable(
  "container_objects",
  {
    containerId: uuid("container_id")
      .notNull()
      .references(() => containers.objectId, { onDelete: "cascade" }),
    objectId: uuid("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    position: integer("position"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.containerId, t.objectId] }),
    index("container_objects_object_idx").on(t.objectId),
    /**
     * MVP restricts an item to ONE container (SCOPE.md §5.3). Note that this is
     * an index, not the schema shape — lifting the restriction for stretch item
     * S5 is a DROP INDEX, not a data migration.
     */
    uniqueIndex("container_objects_single_edge_idx").on(t.objectId),
  ],
);

/* ------------------------------------------------------------------ *
 * Views — presentation only
 * ------------------------------------------------------------------ */

/**
 * A view never creates, copies or mutates a record. `configuration` holds the
 * predicate — membership by rule, Capacities' Query.
 */
export const views = pgTable(
  "views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    containerId: uuid("container_id")
      .notNull()
      .references(() => containers.objectId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    viewType: viewTypeEnum("view_type").notNull().default("table"),
    configuration: jsonb("configuration").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("views_container_idx").on(t.containerId)],
);

export const viewProperties = pgTable(
  "view_properties",
  {
    viewId: uuid("view_id")
      .notNull()
      .references(() => views.id, { onDelete: "cascade" }),
    propertyDefinitionId: uuid("property_definition_id")
      .notNull()
      .references(() => propertyDefinitions.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    width: integer("width"),
    configuration: jsonb("configuration").notNull().default({}),
  },
  (t) => [primaryKey({ columns: [t.viewId, t.propertyDefinitionId] })],
);

/* ------------------------------------------------------------------ *
 * Blocks and references — rich content on an object
 * ------------------------------------------------------------------ */

export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectId: uuid("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    parentBlockId: uuid("parent_block_id"),
    blockType: text("block_type").notNull(),
    position: integer("position").notNull().default(0),
    content: jsonb("content").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("blocks_object_idx").on(t.objectId)],
);

export const objectReferences = pgTable(
  "object_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceObjectId: uuid("source_object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    targetObjectId: uuid("target_object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    blockId: uuid("block_id").references(() => blocks.id, {
      onDelete: "cascade",
    }),
    position: integer("position"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("object_references_target_idx").on(t.targetObjectId)],
);

/* ------------------------------------------------------------------ *
 * Comments
 * ------------------------------------------------------------------ */

/**
 * `parentId` exists because the comment card takes an `onReply` prop — a reply
 * is a comment pointing at another comment. `authorId` rather than a stored
 * name, so renaming a user does not leave stale names in old comments.
 */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    containerId: uuid("container_id")
      .notNull()
      .references(() => containers.objectId, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("comments_container_idx").on(t.containerId)],
);

/* ------------------------------------------------------------------ *
 * Convenience: the four hot item properties
 *
 * Property values live in JSONB, but these four are read on every table paint,
 * so the projection layer resolves them by these well-known names rather than
 * by id lookups scattered through the codebase.
 * ------------------------------------------------------------------ */

export const ITEM_PROPERTY = {
  name: "name",
  qty: "qty",
  weight: "weight",
  value: "value",
  notes: "notes",
  tags: "tags",
} as const;

export type ItemPropertyName =
  (typeof ITEM_PROPERTY)[keyof typeof ITEM_PROPERTY];
