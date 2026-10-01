import { CHARACTER_PROPERTY_NAMES } from "@backend/domain/character";

/**
 * The property definitions every campaign needs before an item can be written.
 *
 * Schema metadata, not values: `setProperties` refuses a property name that has
 * no definition (so a typo cannot write a value nothing reads back), which
 * means a campaign is not usable until these exist. The seed creates them for
 * the default campaign; `createCampaign` creates them for every new one. One
 * list, so the two cannot drift.
 */
export const PROPERTY_DEFS: { name: string; dataType: string; description: string }[] = [
  { name: "name", dataType: "text", description: "Display name" },
  { name: "qty", dataType: "number", description: "How many in this stack" },
  { name: "weight", dataType: "number", description: "Weight per unit, kg" },
  { name: "value", dataType: "text", description: "Value per unit" },
  { name: "tags", dataType: "label", description: "Free tags" },
  { name: "notes", dataType: "text", description: "Notes" },
  { name: "stats", dataType: "json", description: "Type-specific item fields" },
  { name: "members", dataType: "json", description: "Who is in a shared container" },
  {
    name: "capacity",
    dataType: "number",
    description: "Carry capacity, kg — containers only",
  },
  // The character sheet's eight, on the character container's own object
  // (SCOPE.md S1). `json` rather than `number`/`text` because each one holds a
  // structured section rather than a scalar.
  ...CHARACTER_PROPERTY_NAMES.map((name) => ({
    name,
    dataType: "json",
    description: "Character sheet",
  })),
];
