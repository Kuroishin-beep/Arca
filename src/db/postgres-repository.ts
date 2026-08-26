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

import {
  type CommentView,
  type ContainerView,
  type CreateItemInput,
  type ItemView,
  type MoveItemInput,
  type Principal,
  type UpdateItemInput,
  carriedWeight,
} from "@/domain/view";
import {
  assertCanMove,
  assertCanRead,
  assertCanWrite,
  visibleContainers,
} from "@/lib/permissions";

import { db } from "./client";
import {
  type ArcaRepository,
  ConflictError,
  type MoveOutcome,
  NotFoundError,
} from "./repository";
import { CAMPAIGN_ID, pluralise } from "./seed-data";
import {
  campaignMembers,
  comments,
  containerObjects,
  containers,
  objectProperties,
  objectTypeMemberships,
  objectTypes,
  objects,
  propertyDefinitions,
  users,
} from "./schema";

function campaignId(): string {
  return process.env.ARCA_CAMPAIGN_ID ?? CAMPAIGN_ID;
}

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

/** The projection: object graph in, flat ItemView out. */
function project(
  objectId: string,
  containerId: string,
  updatedAt: Date,
  props: Record<string, unknown> | undefined,
  types: string[] | undefined,
): ItemView {
  return {
    id: objectId as ItemView["id"],
    containerId: containerId as ItemView["containerId"],
    name: asString(props?.name, "Unnamed"),
    qty: Math.max(1, Math.trunc(asNumber(props?.qty, 1))),
    weight: asNumber(props?.weight, 0),
    value: asString(props?.value),
    tags: asStringArray(props?.tags),
    notes: asString(props?.notes),
    types: types ?? [],
    updatedAt,
  };
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

  const ids = rows.map((r) => r.objectId);
  const [props, types] = await Promise.all([
    propertiesFor(ids),
    typeNamesFor(ids),
  ]);

  return rows.map((r) =>
    project(
      r.objectId,
      containerId,
      r.updatedAt,
      props.get(r.objectId),
      types.get(r.objectId),
    ),
  );
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

    const [props, types] = await Promise.all([
      propertiesFor([itemId]),
      typeNamesFor([itemId]),
    ]);
    return project(
      itemId,
      container.id,
      row[0].updatedAt,
      props.get(itemId),
      types.get(itemId),
    );
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
          authorRole: r.authorRole ?? "player",
          content: r.content,
          parentId: r.parentId,
          createdAt: r.createdAt,
        }),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
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

    await setProperties(input.id, {
      name: input.name,
      qty: input.qty,
      weight: input.weight,
      value: input.value,
      tags: input.tags,
      notes: input.notes,
    });
    if (input.types !== undefined) await setTypes(input.id, input.types);

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
    const itemName = asString(props?.name, "Item");

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
        role: campaignMembers.role,
      })
      .from(campaignMembers)
      .innerJoin(users, eq(users.id, campaignMembers.userId))
      .where(eq(campaignMembers.campaignId, campaignId()));

    return rows.map((r) => ({
      userId: r.userId as Principal["userId"],
      displayName: r.displayName,
      role: r.role,
    }));
  },
};
