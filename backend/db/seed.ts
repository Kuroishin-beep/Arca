/**
 * Seeds a real Postgres database with the campaign's starting state.
 *
 *     npm run db:generate   # SQL migration from backend/db/schema.ts
 *     npm run db:migrate    # apply it
 *     npm run db:seed       # this file
 *
 * The point of the exercise is that the app looks IDENTICAL afterwards to how
 * it looks against fixtures — same containers, same items, same weights. If it
 * does not, the projection layer and the fixture repository have drifted, and
 * that is exactly the bug this script is designed to surface.
 */
import { sql } from "drizzle-orm";

import { db, rawSql } from "./client";
import {
  CAMPAIGN_ID,
  CAMPAIGN_NAME,
  SEED_COMMENTS,
  SEED_CONTAINERS,
  SEED_ITEMS,
  SEED_TYPE_NAMES,
  SEED_USERS,
  pluralise,
} from "./seed-data";
import {
  campaignMembers,
  campaigns,
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

/** The property definitions every item uses. Schema metadata, not values. */
const PROPERTY_DEFS: { name: string; dataType: string; description: string }[] =
  [
    { name: "name", dataType: "text", description: "Display name" },
    { name: "qty", dataType: "number", description: "How many in this stack" },
    { name: "weight", dataType: "number", description: "Weight per unit, kg" },
    { name: "value", dataType: "text", description: "Value per unit" },
    { name: "tags", dataType: "label", description: "Free tags" },
    { name: "notes", dataType: "text", description: "Notes" },
    {
      name: "capacity",
      dataType: "number",
      description: "Carry capacity, kg — containers only",
    },
  ];

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. The app runs on fixtures without it; set it only when you want a real database.",
    );
    process.exit(1);
  }

  const database = db();
  console.log(`Seeding ${CAMPAIGN_NAME}…`);

  // Idempotent: wipe the campaign and rebuild. Cascades take care of the graph,
  // which is itself a check that the foreign keys are wired correctly.
  await database.delete(campaigns).where(sql`${campaigns.id} = ${CAMPAIGN_ID}`);

  await database.insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: CAMPAIGN_NAME,
  });

  await database
    .insert(users)
    .values(
      SEED_USERS.map((u) => ({ id: u.id, displayName: u.displayName })),
    )
    .onConflictDoNothing();

  await database
    .insert(campaignMembers)
    .values(
      SEED_USERS.map((u) => ({
        campaignId: CAMPAIGN_ID,
        userId: u.id,
        role: u.role,
      })),
    )
    .onConflictDoNothing();

  const propertyRows = await database
    .insert(propertyDefinitions)
    .values(
      PROPERTY_DEFS.map((p) => ({ ...p, campaignId: CAMPAIGN_ID })),
    )
    .returning({ id: propertyDefinitions.id, name: propertyDefinitions.name });
  const propertyId = new Map(propertyRows.map((r) => [r.name, r.id]));

  const typeRows = await database
    .insert(objectTypes)
    .values(
      SEED_TYPE_NAMES.map((name) => ({
        campaignId: CAMPAIGN_ID,
        nameSingular: name,
        namePlural: pluralise(name),
      })),
    )
    .returning({ id: objectTypes.id, name: objectTypes.nameSingular });
  const typeId = new Map(typeRows.map((r) => [r.name, r.id]));

  // A container IS an object, so each one gets an `objects` row first.
  await database.insert(objects).values(
    SEED_CONTAINERS.map((c) => ({ id: c.id, campaignId: CAMPAIGN_ID })),
  );
  await database.insert(containers).values(
    SEED_CONTAINERS.map((c) => ({
      objectId: c.id,
      name: c.name,
      type: c.type,
      ownerId: c.ownerId,
      revealed: c.revealed,
    })),
  );

  const capacityId = propertyId.get("capacity");
  const capacityRows = SEED_CONTAINERS.filter((c) => c.capacity !== null).map(
    (c) => ({
      objectId: c.id,
      propertyDefinitionId: capacityId!,
      value: c.capacity,
    }),
  );
  if (capacityId && capacityRows.length > 0) {
    await database.insert(objectProperties).values(capacityRows);
  }

  // Items: one `objects` row, its property values, its type memberships, and
  // exactly one containment edge.
  await database.insert(objects).values(
    SEED_ITEMS.map((item) => ({ id: item.id, campaignId: CAMPAIGN_ID })),
  );

  const propertyValues = SEED_ITEMS.flatMap((item) =>
    (
      [
        ["name", item.name],
        ["qty", item.qty],
        ["weight", item.weight],
        ["value", item.value],
        ["tags", item.tags],
        ["notes", item.notes],
      ] as const
    )
      .map(([name, value]) => {
        const id = propertyId.get(name);
        return id
          ? { objectId: item.id, propertyDefinitionId: id, value }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
  );
  await database.insert(objectProperties).values(propertyValues);

  const memberships = SEED_ITEMS.flatMap((item) =>
    item.types
      .map((t) => {
        const id = typeId.get(t);
        return id ? { objectId: item.id, typeId: id } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
  );
  await database.insert(objectTypeMemberships).values(memberships);

  await database.insert(containerObjects).values(
    SEED_ITEMS.map((item, index) => ({
      containerId: item.containerId,
      objectId: item.id,
      position: index,
    })),
  );

  await database.insert(comments).values(
    SEED_COMMENTS.map((c) => ({
      id: c.id,
      containerId: c.containerId,
      authorId: c.authorId,
      content: c.content,
      parentId: c.parentId,
      createdAt: new Date(Date.now() - c.minutesAgo * 60_000),
    })),
  );

  console.log(
    `Done. ${SEED_CONTAINERS.length} containers, ${SEED_ITEMS.length} items, ${SEED_TYPE_NAMES.length} types.`,
  );
  await rawSql().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
