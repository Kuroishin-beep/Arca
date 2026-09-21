/**
 * The Postgres repository — the real object graph.
 *
 * Every read here does the same job: walk containment edges, gather the JSONB
 * property values, and flatten the result into the `ItemView` the UI expects.
 * That flattening is the projection boundary from SCOPE.md §5.3 — it is the
 * reason a component never has to know that "name" is a row in
 * `object_properties` rather than a column.
 *
 * Enforcement is the same `assertCan*` helpers the fixture repository uses, so
 * both storage backends obey one rule set rather than two.
 *
 * Row-level security is DEFINED in `drizzle/0001_checks_and_rls.sql` as the
 * backstop underneath that, but it is not load-bearing yet: the app connects as
 * the table owner, and Postgres exempts owners from RLS. See the header of that
 * migration for the two steps that activate it (phase 1).
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { sheetFromProperties } from "@backend/domain/character";
import {
  type CatalogItemView,
  type CommentView,
  type ContainerView,
  type CreateItemInput,
  INSTANCE_OF,
  type ItemView,
  type MoveItemInput,
  type Principal,
  type UpdateItemInput,
  carriedWeight,
  changedInheritedFields,
  inheritedFieldsMessage,
  ownershipProblem,
} from "@backend/domain/view";
import { campaignId } from "@backend/lib/campaign";
import {
  assertCanEditContainer,
  assertCanManageCatalog,
  assertCanManageContainer,
  assertCanManageRoster,
  assertCanMove,
  assertCanRead,
  assertCanRetireContainer,
  assertCanWrite,
  visibleContainers,
} from "@backend/lib/permissions";
import {
  clearFailures,
  hashPassword,
  normaliseEmail,
  verifyPassword,
} from "@backend/lib/password";

import { db } from "./client";
import {
  type ArcaRepository,
  ConflictError,
  type MoveOutcome,
  NotFoundError,
} from "./repository";
import { pluralise } from "./seed-data";
import {
  campaignMembers,
  comments,
  containerObjects,
  containers,
  objectProperties,
  objectRelations,
  objectTypeMemberships,
  objectTypes,
  objects,
  propertyDefinitions,
  relationTypes,
  users,
} from "./schema";

/* ------------------------------------------------------------------ *
 * Property helpers
 *
 * Property values are JSONB keyed by definition, so reading an item means
 * resolving definition ids once and then pivoting rows into a record. Doing
 * that lookup per item would be an N+1; it is done per batch instead.
 * ------------------------------------------------------------------ */

type PropertyMap = Map<string, Record<string, unknown>>;

async function propertyIdsByName(): Promise<Map<string, string>> {
  const rows = await db()
    .select({ id: propertyDefinitions.id, name: propertyDefinitions.name })
    .from(propertyDefinitions)
    .where(eq(propertyDefinitions.campaignId, campaignId()));
  return new Map(rows.map((r) => [r.name, r.id]));
}

async function propertiesFor(objectIds: string[]): Promise<PropertyMap> {
  const out: PropertyMap = new Map();
  if (objectIds.length === 0) return out;

  const rows = await db()
    .select({
      objectId: objectProperties.objectId,
      name: propertyDefinitions.name,
      value: objectProperties.value,
    })
    .from(objectProperties)
    .innerJoin(
      propertyDefinitions,
      eq(propertyDefinitions.id, objectProperties.propertyDefinitionId),
    )
    .where(inArray(objectProperties.objectId, objectIds));

  for (const row of rows) {
    const bag = out.get(row.objectId) ?? {};
    bag[row.name] = row.value;
    out.set(row.objectId, bag);
  }
  return out;
}

async function typeNamesFor(
  objectIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (objectIds.length === 0) return out;

  const rows = await db()
    .select({
      objectId: objectTypeMemberships.objectId,
      name: objectTypes.nameSingular,
    })
    .from(objectTypeMemberships)
    .innerJoin(objectTypes, eq(objectTypes.id, objectTypeMemberships.typeId))
    .where(inArray(objectTypeMemberships.objectId, objectIds));

  for (const row of rows) {
    out.set(row.objectId, [...(out.get(row.objectId) ?? []), row.name]);
  }
  return out;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * The projection: object graph in, flat ItemView out.
 *
 * `entry` is the catalogue definition this object is a copy of, when it is one
 * (SCOPE.md S3). Where it is present its fields WIN, because a copy does not
 * store them — correcting a rope's weight in the catalogue has to correct it in
 * every pack holding one, and the only way a copy can be wrong is if it kept
 * its own snapshot.
 *
 * `qty` and `notes` are never taken from the entry. A quantity belongs to a
 * container, and "found this in the barrow" belongs to whoever wrote it.
 */
function project(
  objectId: string,
  containerId: string,
  updatedAt: Date,
  props: Record<string, unknown> | undefined,
  types: string[] | undefined,
  entry?: { props: Record<string, unknown> | undefined; types: string[] },
): ItemView {
  const own = props ?? {};
  const from = entry?.props ?? own;
  return {
    id: objectId as ItemView["id"],
    containerId: containerId as ItemView["containerId"],
    name: asString(from.name, "Unnamed"),
    qty: Math.max(1, Math.trunc(asNumber(own.qty, 1))),
    weight: asNumber(from.weight, 0),
    value: asString(from.value),
    tags: asStringArray(from.tags),
    notes: asString(own.notes),
    types: entry ? entry.types : (types ?? []),
    catalogItemId: null,
    updatedAt,
  };
}

/**
 * Which catalogue entry each of these objects is a copy of — SCOPE.md S3.
 *
 * Joined through the relation type's NAME rather than through a cached id.
 * `relation_types` has no unique constraint on (campaign, name), so two
 * concurrent first-writes could create two rows both called `instance_of`;
 * matching on the name means links made against either one still resolve, and
 * the duplicate is cosmetic rather than a class of copy that silently forgets
 * its definition.
 */
async function catalogLinksFor(
  objectIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (objectIds.length === 0) return out;

  const rows = await db()
    .select({
      source: objectRelations.sourceObjectId,
      target: objectRelations.targetObjectId,
    })
    .from(objectRelations)
    .innerJoin(
      relationTypes,
      eq(relationTypes.id, objectRelations.relationTypeId),
    )
    .where(
      and(
        eq(relationTypes.campaignId, campaignId()),
        eq(relationTypes.name, INSTANCE_OF),
        inArray(objectRelations.sourceObjectId, objectIds),
      ),
    );

  for (const row of rows) out.set(row.source, row.target);
  return out;
}

/** The definitions behind a set of copies: their properties and their types. */
async function entriesFor(entryIds: string[]): Promise<
  Map<string, { props: Record<string, unknown> | undefined; types: string[] }>
> {
  const out = new Map<
    string,
    { props: Record<string, unknown> | undefined; types: string[] }
  >();
  if (entryIds.length === 0) return out;

  const [props, types] = await Promise.all([
    propertiesFor(entryIds),
    typeNamesFor(entryIds),
  ]);
  for (const id of entryIds) {
    out.set(id, { props: props.get(id), types: types.get(id) ?? [] });
  }
  return out;
}

async function itemsIn(containerId: string): Promise<ItemView[]> {
  const rows = await db()
    .select({
      objectId: objects.id,
      updatedAt: objects.updatedAt,
      position: containerObjects.position,
    })
    .from(containerObjects)
    .innerJoin(objects, eq(objects.id, containerObjects.objectId))
    .where(
      and(
        eq(containerObjects.containerId, containerId),
        isNull(objects.archivedAt),
      ),
    );

  return resolveItems(rows, containerId);
}

/**
 * Objects in a container, as the ItemViews a screen reads — following each
 * one's catalogue link where it has one.
 *
 * THE one place a copy becomes readable. It used to live inline in `itemsIn`,
 * which meant every other path that read a single item — `getItem`, the move
 * result, the edit result — read a copy's own properties instead, and a copy
 * owns no name. The fix was not four patches but one door: anything that turns
 * an object into an ItemView comes through here.
 */
async function resolveItems(
  rows: { objectId: string; updatedAt: Date }[],
  containerId: string,
): Promise<ItemView[]> {
  const ids = rows.map((r) => r.objectId);
  const [props, types, links] = await Promise.all([
    propertiesFor(ids),
    typeNamesFor(ids),
    catalogLinksFor(ids),
  ]);

  // One extra round trip for the whole batch, not one per row: a container of
  // catalogue copies would otherwise be an N+1 on the definitions.
  const entries = await entriesFor([...new Set(links.values())]);

  return rows.map((r) => {
    const entryId = links.get(r.objectId);
    const item = project(
      r.objectId,
      containerId,
      r.updatedAt,
      props.get(r.objectId),
      types.get(r.objectId),
      entryId ? entries.get(entryId) : undefined,
    );
    return entryId
      ? { ...item, catalogItemId: entryId as ItemView["catalogItemId"] }
      : item;
  });
}

/* ------------------------------------------------------------------ *
 * The catalogue — SCOPE.md S3
 * ------------------------------------------------------------------ */

/**
 * A catalogue entry is an object that NO container holds and that is not
 * itself a container.
 *
 * Both halves are load-bearing. The first is the definition — a thing that is
 * not anywhere is a definition of a thing rather than one of them — and it is
 * why entries stay out of every container and database view without a filter
 * being added to either. The second exists because a container is also an
 * object with no containment edge, so without it every pack in the campaign
 * would list itself as a catalogue entry.
 */
async function catalogRows(
  onlyId?: string,
): Promise<{ id: string; updatedAt: Date }[]> {
  return db()
    .select({ id: objects.id, updatedAt: objects.updatedAt })
    .from(objects)
    .where(
      and(
        eq(objects.campaignId, campaignId()),
        isNull(objects.archivedAt),
        onlyId ? eq(objects.id, onlyId) : undefined,
        sql`NOT EXISTS (SELECT 1 FROM container_objects co WHERE co.object_id = ${objects.id})`,
        sql`NOT EXISTS (SELECT 1 FROM containers c WHERE c.object_id = ${objects.id})`,
      ),
    );
}

/** Live copies per entry. Derived, which is what lets `archiveCatalogItem`
 *  ask "is anything still reading this?" without a counter to keep correct. */
async function copyCounts(entryIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (entryIds.length === 0) return out;

  const rows = await db()
    .select({
      target: objectRelations.targetObjectId,
      copies: sql<number>`count(*)::int`,
    })
    .from(objectRelations)
    .innerJoin(
      relationTypes,
      eq(relationTypes.id, objectRelations.relationTypeId),
    )
    .innerJoin(objects, eq(objects.id, objectRelations.sourceObjectId))
    .where(
      and(
        eq(relationTypes.campaignId, campaignId()),
        eq(relationTypes.name, INSTANCE_OF),
        isNull(objects.archivedAt),
        inArray(objectRelations.targetObjectId, entryIds),
      ),
    )
    .groupBy(objectRelations.targetObjectId);

  for (const row of rows) out.set(row.target, Number(row.copies));
  return out;
}

/**
 * The `instance_of` relation type, created on demand.
 *
 * Same reasoning as `setTypes` and `ensurePropertyDefinitions`: the campaign
 * discovers its structure rather than declaring it up front, and the
 * alternative for a database seeded before this feature existed is `db:seed`,
 * which deletes the campaign.
 */
async function instanceOfRelationType(): Promise<string> {
  const existing = await db()
    .select({ id: relationTypes.id })
    .from(relationTypes)
    .where(
      and(
        eq(relationTypes.campaignId, campaignId()),
        eq(relationTypes.name, INSTANCE_OF),
      ),
    )
    .limit(1);

  if (existing[0]) return existing[0].id;

  const inserted = await db()
    .insert(relationTypes)
    .values({
      campaignId: campaignId(),
      name: INSTANCE_OF,
      description: "This object is a copy of a catalogue entry.",
    })
    .returning({ id: relationTypes.id });

  const created = inserted[0];
  if (!created) throw new Error("Insert returned no row.");
  return created.id;
}

function projectCatalog(
  id: string,
  updatedAt: Date,
  props: Record<string, unknown> | undefined,
  types: string[] | undefined,
  copies: number,
): CatalogItemView {
  return {
    id: id as CatalogItemView["id"],
    name: asString(props?.name, "Unnamed"),
    weight: asNumber(props?.weight, 0),
    value: asString(props?.value),
    tags: asStringArray(props?.tags),
    types: types ?? [],
    notes: asString(props?.notes),
    copies,
    updatedAt,
  };
}

/* ------------------------------------------------------------------ *
 * Containers
 * ------------------------------------------------------------------ */

/**
 * Capacity is not a stored column. Dragonbane derives it from STR, so it is
 * read off the container-object's own property bag — the same JSONB machinery
 * the items use, because a container IS an object.
 */
async function loadContainers(): Promise<ContainerView[]> {
  const rows = await db()
    .select({
      id: containers.objectId,
      name: containers.name,
      type: containers.type,
      ownerId: containers.ownerId,
      revealed: containers.revealed,
    })
    .from(containers)
    .innerJoin(objects, eq(objects.id, containers.objectId))
    .where(
      and(eq(objects.campaignId, campaignId()), isNull(objects.archivedAt)),
    );

  const props = await propertiesFor(rows.map((r) => r.id));

  return Promise.all(
    rows.map(async (r) => {
      const items = await itemsIn(r.id);
      const capacityValue = props.get(r.id)?.capacity;
      return {
        id: r.id as ContainerView["id"],
        name: r.name,
        type: r.type,
        ownerId: r.ownerId as ContainerView["ownerId"],
        revealed: r.revealed,
        itemCount: items.reduce((n, i) => n + i.qty, 0),
        carriedWeight: carriedWeight(items),
        capacity:
          typeof capacityValue === "number" && capacityValue > 0
            ? capacityValue
            : null,
      } satisfies ContainerView;
    }),
  );
}

async function requireContainer(containerId: string): Promise<ContainerView> {
  const all = await loadContainers();
  const found = all.find((c) => c.id === containerId);
  if (!found) throw new NotFoundError("No such container.");
  return found;
}

/** Which container currently holds this object, via its containment edge. */
async function containerOf(objectId: string): Promise<ContainerView> {
  const edge = await db()
    .select({ containerId: containerObjects.containerId })
    .from(containerObjects)
    .where(eq(containerObjects.objectId, objectId))
    .limit(1);

  const containerId = edge[0]?.containerId;
  if (!containerId) throw new NotFoundError("That item is no longer here.");
  return requireContainer(containerId);
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

async function setProperties(
  objectId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const ids = await propertyIdsByName();
  const rows = Object.entries(values)
    .filter(([, v]) => v !== undefined)
    .map(([name, value]) => {
      const propertyDefinitionId = ids.get(name);
      if (!propertyDefinitionId) {
        throw new Error(
          `No property definition named "${name}". Run npm run db:seed.`,
        );
      }
      return { objectId, propertyDefinitionId, value };
    });

  if (rows.length === 0) return;

  await db()
    .insert(objectProperties)
    .values(rows)
    .onConflictDoUpdate({
      target: [objectProperties.objectId, objectProperties.propertyDefinitionId],
      set: { value: sql`excluded.value` },
    });
}

/**
 * Create any of these property definitions that the campaign does not have yet.
 *
 * `setProperties` throws on an unknown definition on purpose — a typo in a
 * property name should not silently write a value nothing will ever read back.
 * But the character sheet arrived after this database was seeded, and the
 * alternative to creating its definitions on demand is telling someone to run
 * `npm run db:seed`, which DELETES THE CAMPAIGN and rebuilds it. Losing a
 * table's inventory to unlock a feature is not an upgrade path.
 *
 * This is the same move `setTypes` already makes for object types — "a campaign
 * discovers its structure rather than declaring it up front" — applied to the
 * one other piece of schema metadata that has the same problem.
 */
async function ensurePropertyDefinitions(
  names: readonly string[],
): Promise<void> {
  if (names.length === 0) return;

  await db()
    .insert(propertyDefinitions)
    .values(
      names.map((name) => ({
        campaignId: campaignId(),
        name,
        // `json` because every one of these holds a structured value rather
        // than a scalar. The column is JSONB either way; this is the label a
        // human reads in the definitions table.
        dataType: "json",
        description: "Character sheet",
      })),
    )
    .onConflictDoNothing();
}

async function setTypes(objectId: string, typeNames: string[]): Promise<void> {
  if (typeNames.length === 0) return;

  // Types are created on demand: a campaign discovers its structure rather
  // than declaring it up front (the Capacities "turn into" workflow).
  await db()
    .insert(objectTypes)
    .values(
      typeNames.map((name) => ({
        campaignId: campaignId(),
        nameSingular: name,
        namePlural: pluralise(name),
      })),
    )
    .onConflictDoNothing();

  const rows = await db()
    .select({ id: objectTypes.id, name: objectTypes.nameSingular })
    .from(objectTypes)
    .where(
      and(
        eq(objectTypes.campaignId, campaignId()),
        inArray(objectTypes.nameSingular, typeNames),
      ),
    );

  await db().delete(objectTypeMemberships).where(eq(objectTypeMemberships.objectId, objectId));
  await db()
    .insert(objectTypeMemberships)
    .values(rows.map((r) => ({ objectId, typeId: r.id })))
    .onConflictDoNothing();
}

/* ------------------------------------------------------------------ */

export const postgresRepository: ArcaRepository = {
  async listContainers(principal) {
    return visibleContainers(principal, await loadContainers());
  },

  async getContainer(principal, containerId) {
    const all = await loadContainers();
    const found = all.find((c) => c.id === containerId);
    if (!found) return null;
    assertCanRead(principal, found);
    return found;
  },

  async createContainer(principal, input) {
    assertCanManageContainer(principal, {
      type: input.type,
      ownerId: input.ownerId,
    });

    // Object first, then the container facet: a container IS an object
    // (SCOPE.md §5.2), and the FK runs container.object_id -> objects.id.
    // One transaction, because an object with no container row is a ghost that
    // every query joins away and nothing can ever reach.
    const objectId = await db().transaction(async (tx) => {
      const inserted = await tx
        .insert(objects)
        .values({ campaignId: campaignId() })
        .returning({ id: objects.id });

      const created = inserted[0];
      if (!created) throw new Error("Insert returned no row.");

      await tx.insert(containers).values({
        objectId: created.id,
        name: input.name,
        type: input.type,
        ownerId: input.ownerId,
        // A character or party container is never hidden; only a world
        // container has anything to reveal.
        revealed: input.type === "world" ? input.revealed : true,
      });

      return created.id;
    });

    if (input.capacity !== null) {
      // Capacity is a property on the object, the same machinery an item's
      // weight uses — not a column, because most containers do not have one.
      await setProperties(objectId, { capacity: input.capacity });
    }

    return requireContainer(objectId);
  },

  async updateContainer(principal, input) {
    const existing = await requireContainer(input.id);

    // The merged result, not the patch. A patch carrying only `type` is legal
    // or illegal depending on the owner already stored, so the invariant can
    // only be judged here — the one place that knows both.
    const type = input.type ?? existing.type;
    const ownerId =
      input.ownerId !== undefined ? input.ownerId : existing.ownerId;

    // Both ends, for the same reason a move authorises both: an edit that only
    // checked the result would let a player reshape a container they may touch
    // into one they may not, and vice versa.
    assertCanEditContainer(
      principal,
      { type: existing.type, ownerId: existing.ownerId },
      { type, ownerId },
    );

    const problem = ownershipProblem(type, ownerId);
    if (problem) throw new ConflictError(problem);

    const fields: {
      name?: string;
      type?: ContainerView["type"];
      ownerId?: string | null;
      revealed?: boolean;
    } = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.type !== undefined) fields.type = type;
    if (input.ownerId !== undefined) fields.ownerId = ownerId;

    // Only a world container is ever hidden. Converting away from world must
    // force it visible, or a former world container would linger invisible to
    // every player with no control left to fix it.
    if (type !== "world") {
      fields.revealed = true;
    } else if (input.revealed !== undefined) {
      fields.revealed = input.revealed;
    }

    if (Object.keys(fields).length > 0) {
      await db()
        .update(containers)
        .set(fields)
        .where(eq(containers.objectId, input.id));
    }

    if (input.capacity !== undefined) {
      if (input.capacity === null) {
        // "No limit" is the ABSENCE of the property, not a null stored in it.
        // `loadContainers` asks whether the value is a positive number, so a
        // stored null would read the same — but leaving the row behind means
        // every future reader has to know that null and missing mean the same
        // thing, which is the kind of ambiguity JSONB columns rot from.
        const ids = await propertyIdsByName();
        const capacityId = ids.get("capacity");
        if (capacityId) {
          await db()
            .delete(objectProperties)
            .where(
              and(
                eq(objectProperties.objectId, input.id),
                eq(objectProperties.propertyDefinitionId, capacityId),
              ),
            );
        }
      } else {
        await setProperties(input.id, { capacity: input.capacity });
      }
    }

    await db()
      .update(objects)
      .set({ updatedAt: new Date() })
      .where(eq(objects.id, input.id));

    return requireContainer(input.id);
  },

  async archiveContainer(principal, containerId) {
    assertCanRetireContainer(principal, await requireContainer(containerId));

    const held = await itemsIn(containerId);
    if (held.length > 0) {
      throw new ConflictError(
        `That container still holds ${held.length} ${
          held.length === 1 ? "item" : "items"
        }. Move them somewhere else first.`,
      );
    }

    await db()
      .update(objects)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(objects.id, containerId));
  },

  /* ---------------------------------------------------------------- *
   * The catalogue — SCOPE.md S3
   * ---------------------------------------------------------------- */

  async listCatalog() {
    const rows = await catalogRows();
    const ids = rows.map((r) => r.id);
    const [props, types, copies] = await Promise.all([
      propertiesFor(ids),
      typeNamesFor(ids),
      copyCounts(ids),
    ]);

    return rows
      .map((r) =>
        projectCatalog(
          r.id,
          r.updatedAt,
          props.get(r.id),
          types.get(r.id),
          copies.get(r.id) ?? 0,
        ),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async getCatalogItem(_principal, catalogItemId) {
    const rows = await catalogRows(catalogItemId);
    const row = rows[0];
    if (!row) return null;

    const [props, types, copies] = await Promise.all([
      propertiesFor([row.id]),
      typeNamesFor([row.id]),
      copyCounts([row.id]),
    ]);
    return projectCatalog(
      row.id,
      row.updatedAt,
      props.get(row.id),
      types.get(row.id),
      copies.get(row.id) ?? 0,
    );
  },

  async createCatalogItem(principal, input) {
    assertCanManageCatalog(principal);

    // An object and nothing else. No containment edge is not an omission here,
    // it IS the definition: a thing that is not anywhere is a definition of a
    // thing rather than one of them.
    const inserted = await db()
      .insert(objects)
      .values({ campaignId: campaignId() })
      .returning({ id: objects.id });

    const created = inserted[0];
    if (!created) throw new Error("Insert returned no row.");

    await setProperties(created.id, {
      name: input.name,
      weight: input.weight,
      value: input.value,
      tags: input.tags,
      notes: input.notes,
    });
    await setTypes(created.id, input.types);

    const entry = await postgresRepository.getCatalogItem(
      principal,
      created.id,
    );
    if (!entry) throw new Error("Catalogue entry vanished after insert.");
    return entry;
  },

  async updateCatalogItem(principal, input) {
    assertCanManageCatalog(principal);

    const { id, types, ...fields } = input;
    const existing = await catalogRows(id);
    if (existing.length === 0) {
      throw new NotFoundError("No such catalogue entry.");
    }

    await setProperties(id, fields);
    if (types !== undefined) await setTypes(id, types);
    await db()
      .update(objects)
      .set({ updatedAt: new Date() })
      .where(eq(objects.id, id));

    // Nothing fans out to the copies, and nothing needs to: they read these
    // fields through the link rather than holding their own.
    const entry = await postgresRepository.getCatalogItem(principal, id);
    if (!entry) throw new Error("Catalogue entry vanished after update.");
    return entry;
  },

  async archiveCatalogItem(principal, catalogItemId) {
    assertCanManageCatalog(principal);

    const existing = await catalogRows(catalogItemId);
    if (existing.length === 0) {
      throw new NotFoundError("No such catalogue entry.");
    }

    const copies = (await copyCounts([catalogItemId])).get(catalogItemId) ?? 0;
    if (copies > 0) {
      throw new ConflictError(
        `${copies} ${copies === 1 ? "copy" : "copies"} of that still ` +
          `${copies === 1 ? "exists" : "exist"}. Archiving it would leave ` +
          `${copies === 1 ? "it" : "them"} reading a definition nothing can open.`,
      );
    }

    await db()
      .update(objects)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(objects.id, catalogItemId));
  },

  async addFromCatalog(principal, input) {
    const container = await requireContainer(input.containerId);
    // Destination only: nothing leaves the catalogue, so there is no source to
    // authorise. This is a copy, not a move.
    assertCanWrite(principal, container);

    const entry = await catalogRows(input.catalogItemId);
    if (entry.length === 0) {
      throw new NotFoundError("No such catalogue entry.");
    }

    const relationTypeId = await instanceOfRelationType();

    const objectId = await db().transaction(async (tx) => {
      const inserted = await tx
        .insert(objects)
        .values({ campaignId: campaignId() })
        .returning({ id: objects.id });

      const created = inserted[0];
      if (!created) throw new Error("Insert returned no row.");

      await tx.insert(containerObjects).values({
        containerId: input.containerId,
        objectId: created.id,
      });

      await tx.insert(objectRelations).values({
        sourceObjectId: created.id,
        relationTypeId,
        targetObjectId: input.catalogItemId,
      });

      return created.id;
    });

    // Only what is genuinely its own. Everything else is read through the
    // link, so writing it here would be creating the snapshot this feature
    // exists to avoid.
    await setProperties(objectId, { qty: input.qty, notes: "" });

    const items = await itemsIn(input.containerId);
    const created = items.find((i) => i.id === objectId);
    if (!created) throw new Error("Copy vanished after insert.");
    return created;
  },

  async getCharacter(principal, containerId) {
    const container = await requireContainer(containerId);
    assertCanRead(principal, container);
    if (container.type !== "character") return null;

    // The sheet lives on the container's OWN object — the same property bag
    // `capacity` comes out of, because a container IS an object.
    const props = await propertiesFor([containerId]);

    return {
      containerId: container.id,
      name: container.name,
      ownerId: container.ownerId,
      sheet: sheetFromProperties(props.get(containerId)),
    };
  },

  async updateCharacter(principal, input) {
    const container = await requireContainer(input.containerId);
    assertCanWrite(principal, container);
    if (container.type !== "character") {
      throw new NotFoundError("That container is not a character.");
    }

    const { containerId, ...patch } = input;
    const present = Object.entries(patch).filter(([, v]) => v !== undefined);

    if (present.length > 0) {
      await ensurePropertyDefinitions(present.map(([name]) => name));
      await setProperties(containerId, Object.fromEntries(present));
      await db()
        .update(objects)
        .set({ updatedAt: new Date() })
        .where(eq(objects.id, containerId));
    }

    // Re-read rather than merging in memory. The clamp in `sheetFromProperties`
    // has to see the STORED result — lowering CON and leaving HP above the new
    // maximum is exactly the case a merged-in-memory answer would report wrong.
    const props = await propertiesFor([containerId]);
    return {
      containerId: container.id,
      name: container.name,
      ownerId: container.ownerId,
      sheet: sheetFromProperties(props.get(containerId)),
    };
  },

  async listItems(principal, containerId) {
    assertCanRead(principal, await requireContainer(containerId));
    return itemsIn(containerId);
  },

  async getItem(principal, itemId) {
    const row = await db()
      .select({ id: objects.id, updatedAt: objects.updatedAt })
      .from(objects)
      .where(and(eq(objects.id, itemId), isNull(objects.archivedAt)))
      .limit(1);
    if (!row[0]) return null;

    const container = await containerOf(itemId);
    assertCanRead(principal, container);

    // Through the resolver, not straight off the object's own properties: a
    // catalogue copy stores no name, so reading it directly returned "Unnamed"
    // with its link dropped.
    const [item] = await resolveItems(
      [{ objectId: itemId, updatedAt: row[0].updatedAt }],
      container.id,
    );
    return item ?? null;
  },

  async listComments(principal, containerId) {
    assertCanRead(principal, await requireContainer(containerId));

    const rows = await db()
      .select({
        id: comments.id,
        containerId: comments.containerId,
        content: comments.content,
        parentId: comments.parentId,
        createdAt: comments.createdAt,
        authorName: users.displayName,
        authorEmail: users.email,
        authorRole: campaignMembers.role,
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .leftJoin(
        campaignMembers,
        and(
          eq(campaignMembers.userId, comments.authorId),
          eq(campaignMembers.campaignId, campaignId()),
        ),
      )
      .where(eq(comments.containerId, containerId));

    return rows
      .map(
        (r): CommentView => ({
          id: r.id,
          containerId: r.containerId as CommentView["containerId"],
          authorName: r.authorName,
          authorEmail: r.authorEmail,
          authorRole: r.authorRole ?? "player",
          content: r.content,
          parentId: r.parentId,
          createdAt: r.createdAt,
        }),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },

  async createComment(principal, input) {
    assertCanRead(principal, await requireContainer(input.containerId));

    // One level of threading: a reply to a reply is re-pointed at that reply's
    // own parent, so the thread cannot grow a third level regardless of what
    // the client sends (M12).
    let parentId = input.parentId;
    if (parentId) {
      const parent = await db()
        .select({ id: comments.id, parentId: comments.parentId })
        .from(comments)
        .where(
          and(eq(comments.id, parentId), eq(comments.containerId, input.containerId)),
        )
        .limit(1);
      // A parent in a different container, or none at all, becomes a top-level
      // comment rather than an error — the comment is still worth keeping.
      parentId = parent[0] ? (parent[0].parentId ?? parent[0].id) : null;
    }

    const inserted = await db()
      .insert(comments)
      .values({
        containerId: input.containerId,
        authorId: principal.userId,
        content: input.content,
        parentId,
      })
      .returning({
        id: comments.id,
        createdAt: comments.createdAt,
      });

    const row = inserted[0];
    if (!row) throw new Error("Insert returned no row.");

    return {
      id: row.id,
      containerId: input.containerId,
      authorName: principal.displayName,
      authorEmail: principal.email,
      authorRole: principal.role,
      content: input.content,
      parentId,
      createdAt: row.createdAt,
    };
  },

  async createItem(principal, input: CreateItemInput) {
    assertCanWrite(principal, await requireContainer(input.containerId));

    const inserted = await db()
      .insert(objects)
      .values({ campaignId: campaignId() })
      .returning({ id: objects.id, updatedAt: objects.updatedAt });

    const object = inserted[0];
    if (!object) throw new Error("Insert returned no row.");

    await setProperties(object.id, {
      name: input.name,
      qty: input.qty,
      weight: input.weight,
      value: input.value,
      tags: input.tags,
      notes: input.notes,
    });
    await setTypes(object.id, input.types);
    await db()
      .insert(containerObjects)
      .values({ containerId: input.containerId, objectId: object.id });

    return project(
      object.id,
      input.containerId,
      object.updatedAt,
      {
        name: input.name,
        qty: input.qty,
        weight: input.weight,
        value: input.value,
        tags: input.tags,
        notes: input.notes,
      },
      input.types,
    );
  },

  async updateItem(principal, input: UpdateItemInput) {
    const container = await containerOf(input.id);
    assertCanWrite(principal, container);

    const current = await postgresRepository.getItem(principal, input.id);
    if (!current) throw new NotFoundError("That item is no longer here.");

    // A catalogue copy owns its quantity and notes and nothing else. Writing
    // its name here would store a value the next read overwrites from the
    // entry — an edit that appears to save and silently does not. So a CHANGE
    // to an inherited field is refused with directions; an unchanged one (the
    // form round-trips what it displayed) is simply dropped.
    const isCopy = current.catalogItemId !== null;
    if (isCopy) {
      const changed = changedInheritedFields(current, input);
      if (changed.length > 0) {
        throw new ConflictError(inheritedFieldsMessage(changed));
      }
    }

    await setProperties(input.id, {
      name: isCopy ? undefined : input.name,
      qty: input.qty,
      weight: isCopy ? undefined : input.weight,
      value: isCopy ? undefined : input.value,
      tags: isCopy ? undefined : input.tags,
      notes: input.notes,
    });
    if (!isCopy && input.types !== undefined) {
      await setTypes(input.id, input.types);
    }

    await db()
      .update(objects)
      .set({ updatedAt: new Date() })
      .where(eq(objects.id, input.id));

    const updated = await postgresRepository.getItem(principal, input.id);
    if (!updated) throw new NotFoundError("That item is no longer here.");
    return updated;
  },

  async archiveItem(principal, itemId) {
    assertCanWrite(principal, await containerOf(itemId));
    // Soft delete. The containment edge is left intact so an undo restores the
    // item to where it actually was, not to wherever the UI last showed it.
    await db()
      .update(objects)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(objects.id, itemId));
  },

  async moveItem(principal, input: MoveItemInput): Promise<MoveOutcome> {
    const from = await containerOf(input.itemId);
    const to = await requireContainer(input.toContainerId);

    if (from.id === to.id) throw new ConflictError("That item is already there.");
    assertCanMove(principal, from, to);

    const props = (await propertiesFor([input.itemId])).get(input.itemId);
    const currentQty = Math.max(1, Math.trunc(asNumber(props?.qty, 1)));

    // The name from the RESOLVED item, not the object's own properties. A
    // catalogue copy stores no name, so reading props directly announced a move
    // of "Item" to the whole table.
    const resolved = await postgresRepository.getItem(principal, input.itemId);
    const itemName = resolved?.name ?? "Item";

    if (input.qty > currentQty) {
      throw new ConflictError(
        `Only ${currentQty} left — someone may have moved the rest.`,
      );
    }

    const split = input.qty < currentQty;

    // One transaction. A move that half-applied would put an item in two
    // places or none, and at a table both look like the app losing loot.
    await db().transaction(async (tx) => {
      // Lock the edge so two simultaneous moves of the same stack serialise
      // rather than silently overwriting each other (SCOPE.md §8.1).
      await tx.execute(
        sql`select 1 from ${containerObjects}
            where ${containerObjects.objectId} = ${input.itemId}
            for update`,
      );

      if (!split) {
        // The whole stack: ONE column changes. Identity, properties, notes and
        // comments are untouched.
        await tx
          .update(containerObjects)
          .set({ containerId: to.id })
          .where(eq(containerObjects.objectId, input.itemId));
        await tx
          .update(objects)
          .set({ updatedAt: new Date() })
          .where(eq(objects.id, input.itemId));
        return;
      }

      // A partial move splits the stack: the source keeps the remainder, and a
      // new object with the same properties arrives at the destination.
      const created = await tx
        .insert(objects)
        .values({ campaignId: campaignId() })
        .returning({ id: objects.id });
      const newId = created[0]?.id;
      if (!newId) throw new Error("Insert returned no row.");

      const ids = await propertyIdsByName();
      const clone = { ...(props ?? {}), qty: input.qty };
      const rows = Object.entries(clone)
        .map(([name, value]) => {
          const propertyDefinitionId = ids.get(name);
          return propertyDefinitionId
            ? { objectId: newId, propertyDefinitionId, value }
            : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (rows.length > 0) await tx.insert(objectProperties).values(rows);

      const typeRows = await tx
        .select({ typeId: objectTypeMemberships.typeId })
        .from(objectTypeMemberships)
        .where(eq(objectTypeMemberships.objectId, input.itemId));
      if (typeRows.length > 0) {
        await tx
          .insert(objectTypeMemberships)
          .values(typeRows.map((t) => ({ objectId: newId, typeId: t.typeId })));
      }

      /**
       * And its relations — which is the half this used to miss.
       *
       * A split produces two stacks of the SAME thing, so whatever the stack
       * meant beyond its properties, both halves still mean it. For a
       * catalogue copy that is not a nicety: its name, weight and value live
       * on the entry, reached only through this relation, so a clone that
       * copied the properties and not the link arrived as an "Unnamed" 0 kg
       * item — the moved half silently stopped being what it was.
       *
       * Every OUTGOING relation, not just `instance_of`: "crafted by the
       * blacksmith" is equally true of both halves of a split stack, and
       * special-casing one relation kind is how the next one gets dropped.
       */
      const relationRows = await tx
        .select({
          relationTypeId: objectRelations.relationTypeId,
          targetObjectId: objectRelations.targetObjectId,
          metadata: objectRelations.metadata,
        })
        .from(objectRelations)
        .where(eq(objectRelations.sourceObjectId, input.itemId));
      if (relationRows.length > 0) {
        await tx
          .insert(objectRelations)
          .values(relationRows.map((r) => ({ ...r, sourceObjectId: newId })));
      }

      await tx
        .insert(containerObjects)
        .values({ containerId: to.id, objectId: newId });

      const remaining = currentQty - input.qty;
      const qtyPropertyId = ids.get("qty");
      if (qtyPropertyId) {
        await tx
          .insert(objectProperties)
          .values({
            objectId: input.itemId,
            propertyDefinitionId: qtyPropertyId,
            value: remaining,
          })
          .onConflictDoUpdate({
            target: [
              objectProperties.objectId,
              objectProperties.propertyDefinitionId,
            ],
            set: { value: sql`excluded.value` },
          });
      }
      await tx
        .update(objects)
        .set({ updatedAt: new Date() })
        .where(eq(objects.id, input.itemId));
    });

    return {
      movedQty: input.qty,
      split,
      fromContainerId: from.id,
      toContainerId: to.id,
      itemName,
    };
  },

  async listMembers() {
    const rows = await db()
      .select({
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        role: campaignMembers.role,
        // The presence of a hash, never the hash. Selecting the column and
        // mapping it away later would put it in scope in a module that renders
        // to a page.
        hasPassword: sql<boolean>`${users.passwordHash} is not null`,
      })
      .from(campaignMembers)
      .innerJoin(users, eq(users.id, campaignMembers.userId))
      .where(eq(campaignMembers.campaignId, campaignId()));

    return rows.map((r) => ({
      userId: r.userId as Principal["userId"],
      displayName: r.displayName,
      email: r.email,
      role: r.role,
      hasPassword: r.hasPassword,
    }));
  },

  async authenticateMember(email, password) {
    // The join is the authorisation: a user row with no membership in THIS
    // campaign produces no row here, so a correct password on an account that
    // has been removed from the table is still not a principal.
    const row = await memberWithHash(email);
    if (!row?.passwordHash) return null;
    if (!(await verifyPassword(password, row.passwordHash))) return null;

    clearFailures(email);
    return principalOf(row);
  },

  async registerMember(input) {
    const email = normaliseEmail(input.email);
    const hash = await hashPassword(input.password);

    // The unique index on `users.email` is the race condition's answer, not
    // this read — two simultaneous sign-ups with one address both pass a
    // prior SELECT. `onConflictDoNothing` lets the database arbitrate and
    // returns no row to the loser.
    const inserted = await db()
      .insert(users)
      .values({ displayName: input.displayName, email, passwordHash: hash })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    const row = inserted[0];
    if (!row) return null;

    // Never from the input. Self-signup mints players and only players.
    await db()
      .insert(campaignMembers)
      .values({ campaignId: campaignId(), userId: row.id, role: "player" })
      .onConflictDoNothing();

    return {
      userId: row.id as Principal["userId"],
      displayName: input.displayName,
      email,
      role: "player",
    };
  },

  async addMember(principal, input) {
    assertCanManageRoster(principal);

    const email = normaliseEmail(input.email);

    const inserted = await db()
      .insert(users)
      .values({ displayName: input.displayName, email })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    const row = inserted[0];
    if (!row) return null;

    await db()
      .insert(campaignMembers)
      .values({ campaignId: campaignId(), userId: row.id, role: input.role })
      .onConflictDoNothing();

    return {
      userId: row.id as Principal["userId"],
      displayName: input.displayName,
      email,
      role: input.role,
      // Unenrolled: they choose their own password on first sign-in.
      hasPassword: false,
    };
  },

  async resetMemberPassword(principal, userId) {
    assertCanManageRoster(principal);

    // An id that is not a uuid reaches Postgres as a cast error rather than as
    // "no such member", and this value arrives from a form field.
    if (!UUID.test(userId)) throw new NotFoundError("No such member.");

    // The join is the authorisation: the GM of THIS campaign cannot clear the
    // password of someone who is not at this table.
    const rows = await db()
      .select({ email: users.email })
      .from(users)
      .innerJoin(campaignMembers, eq(campaignMembers.userId, users.id))
      .where(
        and(
          eq(users.id, userId),
          eq(campaignMembers.campaignId, campaignId()),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundError("No such member.");

    await db()
      .update(users)
      .set({ passwordHash: null })
      .where(eq(users.id, userId));

    // The throttle is keyed by address, so a reset that did not clear it would
    // leave a locked-out member locked out with a brand new password.
    clearFailures(row.email);
  },

  async enrolMemberPassword(email, password) {
    const row = await memberWithHash(email);
    if (!row || row.passwordHash !== null) return null;

    const hash = await hashPassword(password);

    // `is null` in the WHERE, not just in the check above: two tabs opened on
    // the same unenrolled address would otherwise both pass the read and the
    // second would overwrite the first person's password. The row's unenrolled
    // state is the lock.
    const updated = await db()
      .update(users)
      .set({ passwordHash: hash })
      .where(and(eq(users.id, row.userId), isNull(users.passwordHash)))
      .returning({ id: users.id });

    if (updated.length === 0) return null;

    return principalOf(row);
  },
};

/** Ids reach this module from form fields and URL segments, where a value that
 *  is not a uuid is a normal thing to receive. Postgres answers one with a cast
 *  ERROR rather than an empty result, so it is checked before the query rather
 *  than caught after it. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One member of THIS campaign, by email, with their stored hash. Not
 *  exported: the hash must not leave this module. */
async function memberWithHash(email: string) {
  // Normalised here rather than at the call sites, so no route can look a
  // member up by an address the column could never hold.
  const wanted = normaliseEmail(email);
  if (wanted === "") return null;

  const rows = await db()
    .select({
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
      role: campaignMembers.role,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .innerJoin(campaignMembers, eq(campaignMembers.userId, users.id))
    .where(
      and(
        eq(users.email, wanted),
        eq(campaignMembers.campaignId, campaignId()),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Names the fields that may leave, rather than removing the one that may
 *  not — so a column added to the select above is not published by default. */
function principalOf(row: {
  userId: string;
  displayName: string;
  email: string;
  role: Principal["role"];
}): Principal {
  return {
    userId: row.userId as Principal["userId"],
    displayName: row.displayName,
    email: row.email,
    role: row.role,
  };
}
