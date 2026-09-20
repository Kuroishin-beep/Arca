/**
 * The campaign's starting state.
 *
 * Shared by the fixture repository and by `npm run db:seed`, so the app looks
 * identical whether or not a database is attached — which makes "does this bug
 * come from the schema or the UI?" answerable by flipping one env var.
 *
 * Names and contents match the mockups in `mockups/` so a screenshot and a
 * running screen can be compared directly.
 */
import type { CharacterSheet } from "@backend/domain/character";

export interface SeedUser {
  id: string;
  displayName: string;
  /** Already normalised — lowercase, trimmed — because this is what the
   *  `users.email` column stores and what a sign-in is compared against.
   *  `.example` is the RFC 2606 reserved TLD: it can never resolve, so a seed
   *  address can never accidentally become somewhere mail is sent. */
  email: string;
  role: "gm" | "player";
}

export interface SeedContainer {
  id: string;
  name: string;
  type: "character" | "party" | "world";
  ownerId: string | null;
  revealed: boolean;
  /** `null` = not encumbered. A wagon does not get tired; a dwarf does. */
  capacity: number | null;
}

export interface SeedItem {
  id: string;
  containerId: string;
  name: string;
  qty: number;
  weight: number;
  value: string;
  tags: string[];
  notes: string;
  types: string[];
}

export interface SeedComment {
  id: string;
  containerId: string;
  authorId: string;
  content: string;
  parentId: string | null;
  /** Minutes before "now", so the seed never goes stale. */
  minutesAgo: number;
}

export const CAMPAIGN_ID = "00000000-0000-4000-8000-000000000001";
export const CAMPAIGN_NAME = "Ravenholt Westmarch";

const u = (n: number) => `00000000-0000-4000-8000-00000000010${n}`;
const c = (n: number) => `00000000-0000-4000-8000-00000000020${n}`;
// The last UUID group is exactly 12 hex digits. Getting this wrong produces a
// string that LOOKS like a uuid and fails `z.string().uuid()` at the first
// mutation — which is precisely how the move action was silently rejecting
// every request before this was caught.
const i = (n: string) => `00000000-0000-4000-8000-${`3${n}`.padStart(12, "0")}`;

export const SEED_USERS: SeedUser[] = [
  { id: u(1), displayName: "Ravna", email: "ravna@ravenholt.example", role: "gm" },
  { id: u(2), displayName: "Kova", email: "kova@ravenholt.example", role: "player" },
  { id: u(3), displayName: "Milo", email: "milo@ravenholt.example", role: "player" },
];

export const GM_EMAIL = SEED_USERS[0]!.email;
export const KOVA_EMAIL = SEED_USERS[1]!.email;
export const MILO_EMAIL = SEED_USERS[2]!.email;

export const GM_ID = u(1);
export const KOVA_ID = u(2);
export const MILO_ID = u(3);

export const SEED_CONTAINERS: SeedContainer[] = [
  // A character container is named for the CHARACTER, not for the bag. That is
  // the whole of the naming rule: the sidebar, the database's "Where" column,
  // the move dialog and the character sheet all read `container.name`, so one
  // string is one identity everywhere and renaming from any of them renames in
  // all of them. Calling this "Kova's Pack" while the sheet said "Kova" was two
  // names for one person, and no amount of syncing makes that read well.
  {
    id: c(1),
    name: "Kova",
    type: "character",
    ownerId: KOVA_ID,
    revealed: true,
    capacity: 12,
  },
  {
    id: c(2),
    name: "Milo",
    type: "character",
    ownerId: MILO_ID,
    revealed: true,
    capacity: 12,
  },
  {
    id: c(3),
    name: "Party Wagon",
    type: "party",
    ownerId: null,
    revealed: true,
    capacity: 40,
  },
  {
    id: c(4),
    name: "Ravenholt Stash",
    type: "party",
    ownerId: null,
    revealed: true,
    capacity: null,
  },
  {
    id: c(5),
    name: "Barrow Chest",
    type: "world",
    ownerId: null,
    revealed: true,
    capacity: null,
  },
  {
    // Unrevealed: a player must not see this in the sidebar, and its contents
    // must never reach their device. Verified by the permission tests.
    id: c(6),
    name: "The Sunken Vault",
    type: "world",
    ownerId: null,
    revealed: false,
    capacity: null,
  },
];

export const PARTY_WAGON_ID = c(3);
export const KOVA_CONTAINER_ID = c(1);
export const MILO_CONTAINER_ID = c(2);

/* ------------------------------------------------------------------ *
 * Character sheets — SCOPE.md S1
 * ------------------------------------------------------------------ */

/**
 * Two filled-in sheets, keyed by the character container they belong to.
 *
 * Seeded with real numbers rather than left empty, for the same reason the
 * items are: an empty sheet proves the form renders, and a filled one proves
 * the DERIVED values do. Kova's movement of 14 is not typed in anywhere — it
 * falls out of elf (10) plus the AGL 16 step (+4), and if that ever reads 10 on
 * screen the derivation is broken in a way an empty sheet would have hidden.
 *
 * Each character's trained skills match what they are actually carrying:
 * Kova has the longbow and the trained Bows to use it, Milo has the warhammer
 * and Hammers. A sheet that contradicts the pack it sits on is a worked example
 * of nothing.
 */
export const SEED_CHARACTERS: Record<string, CharacterSheet> = {
  [c(1)]: {
    attributes: { STR: 11, CON: 12, AGL: 16, INT: 14, WIL: 14, CHA: 11 },
    hp: 12,
    wp: 14,
    deathRolls: { successes: 0, failures: 0 },
    conditions: {
      exhausted: false,
      sickly: false,
      dazed: false,
      angry: false,
      scared: false,
      disheartened: false,
    },
    profile: {
      kin: "elf",
      profession: "Hunter",
      age: "adult",
      appearance: "Lean, weather-worn, green cloak that has seen three winters.",
      weakness: "Child of the wild. Never sleeps indoors.",
      memento: "A fletching from her first kill.",
    },
    skills: {
      Awareness: { trained: true, marked: false },
      Bushcraft: { trained: true, marked: true },
      "Hunting & Fishing": { trained: true, marked: false },
      Sneaking: { trained: true, marked: false },
      Bows: { trained: true, marked: true },
      Knives: { trained: true, marked: false },
      Acrobatics: { trained: false, marked: true },
    },
    spells: [],
  },
  [c(2)]: {
    // Deliberately wounded and one condition down: the sheet's warning states
    // are worth seeing without having to injure somebody first.
    attributes: { STR: 14, CON: 13, AGL: 12, INT: 10, WIL: 11, CHA: 13 },
    hp: 9,
    wp: 11,
    deathRolls: { successes: 0, failures: 0 },
    conditions: {
      exhausted: true,
      sickly: false,
      dazed: false,
      angry: false,
      scared: false,
      disheartened: false,
    },
    profile: {
      kin: "halfling",
      profession: "Artisan",
      age: "adult",
      appearance: "Broad for a halfling, soot under the fingernails.",
      weakness: "Cannot leave a broken thing unmended.",
      memento: "His grandmother's hammer.",
    },
    skills: {
      Crafting: { trained: true, marked: true },
      Bartering: { trained: true, marked: false },
      Persuasion: { trained: true, marked: false },
      Hammers: { trained: true, marked: false },
      Brawling: { trained: true, marked: false },
    },
    spells: [],
  },
};

export const SEED_ITEMS: SeedItem[] = [
  // ── Party Wagon ──────────────────────────────────────────────────
  {
    id: i("001"),
    containerId: c(3),
    name: "Rope, hempen (10 m)",
    qty: 2,
    weight: 1,
    value: "4 sp",
    tags: ["gear"],
    notes:
      "Frayed at one end. Milo says it will hold a person but not a horse.",
    types: ["Physical Object", "Gear"],
  },
  {
    id: i("002"),
    containerId: c(3),
    name: "Healing Potion",
    qty: 5,
    weight: 0.5,
    value: "50 gp",
    tags: ["consumable"],
    notes: "",
    types: ["Physical Object", "Consumable"],
  },
  {
    id: i("003"),
    containerId: c(3),
    name: "Longsword +1",
    qty: 1,
    weight: 1.5,
    value: "150 gp",
    tags: ["weapon"],
    notes: "Recovered from the barrow. Nobody has claimed it yet.",
    types: ["Physical Object", "Weapon", "Equipment"],
  },
  {
    id: i("004"),
    containerId: c(3),
    name: "Rations, dried (1 day)",
    qty: 14,
    weight: 0.5,
    value: "2 sp",
    tags: ["consumable"],
    notes: "",
    types: ["Physical Object", "Consumable"],
  },
  {
    id: i("005"),
    containerId: c(3),
    name: "Lantern, hooded",
    qty: 1,
    weight: 1,
    value: "5 gp",
    tags: ["gear"],
    notes: "",
    types: ["Physical Object", "Gear"],
  },
  {
    id: i("006"),
    containerId: c(3),
    name: "Iron spikes (bundle of 10)",
    qty: 3,
    weight: 1,
    value: "1 gp",
    tags: ["gear"],
    notes: "",
    types: ["Physical Object", "Gear"],
  },
  {
    id: i("007"),
    containerId: c(3),
    name: "Oil flask",
    qty: 4,
    weight: 0.5,
    value: "1 sp",
    tags: ["consumable"],
    notes: "",
    types: ["Physical Object", "Consumable"],
  },
  {
    id: i("008"),
    containerId: c(3),
    name: "Tent, two-person",
    qty: 2,
    weight: 3,
    value: "2 gp",
    tags: ["gear"],
    notes: "",
    types: ["Physical Object", "Gear"],
  },

  // ── Kova's Pack ──────────────────────────────────────────────────
  {
    id: i("101"),
    containerId: c(1),
    name: "Longbow",
    qty: 1,
    weight: 1,
    value: "75 gp",
    tags: ["weapon"],
    notes: "",
    types: ["Physical Object", "Weapon", "Equipment"],
  },
  {
    id: i("102"),
    containerId: c(1),
    name: "Leather armour",
    qty: 1,
    weight: 2,
    value: "10 gp",
    tags: ["armour"],
    notes: "",
    types: ["Physical Object", "Equipment"],
  },
  {
    id: i("103"),
    containerId: c(1),
    name: "Arrows",
    qty: 20,
    weight: 0.05,
    value: "1 sp",
    tags: ["ammunition"],
    notes: "",
    types: ["Physical Object", "Consumable"],
  },
  {
    id: i("104"),
    containerId: c(1),
    name: "Hand axe",
    qty: 1,
    weight: 1,
    value: "5 gp",
    tags: ["weapon"],
    notes: "",
    types: ["Physical Object", "Weapon", "Equipment"],
  },
  {
    id: i("105"),
    containerId: c(1),
    name: "Waterskin",
    qty: 1,
    weight: 1,
    value: "2 sp",
    tags: ["gear"],
    notes: "",
    types: ["Physical Object", "Gear"],
  },
  {
    id: i("106"),
    containerId: c(1),
    name: "Tinderbox",
    qty: 1,
    weight: 0.5,
    value: "5 sp",
    tags: ["gear"],
    notes: "",
    types: ["Physical Object", "Gear"],
  },
  {
    id: i("107"),
    containerId: c(1),
    name: "Bedroll",
    qty: 1,
    weight: 1,
    value: "1 gp",
    tags: ["gear"],
    notes: "",
    types: ["Physical Object", "Gear"],
  },
  {
    id: i("108"),
    containerId: c(1),
    name: "Trail rations",
    qty: 6,
    weight: 0.5,
    value: "2 sp",
    tags: ["consumable"],
    notes: "",
    types: ["Physical Object", "Consumable"],
  },

  // ── Milo's Pack — deliberately over capacity, to exercise the state ──
  {
    id: i("201"),
    containerId: c(2),
    name: "Chainmail",
    qty: 1,
    weight: 6,
    value: "75 gp",
    tags: ["armour"],
    notes: "",
    types: ["Physical Object", "Equipment"],
  },
  {
    id: i("202"),
    containerId: c(2),
    name: "Warhammer",
    qty: 1,
    weight: 2,
    value: "15 gp",
    tags: ["weapon"],
    notes: "",
    types: ["Physical Object", "Weapon", "Equipment"],
  },
  {
    id: i("203"),
    containerId: c(2),
    name: "Shield",
    qty: 1,
    weight: 2,
    value: "10 gp",
    tags: ["armour"],
    notes: "",
    types: ["Physical Object", "Equipment"],
  },
  {
    id: i("204"),
    containerId: c(2),
    name: "Iron rations",
    qty: 8,
    weight: 0.5,
    value: "5 sp",
    tags: ["consumable"],
    notes: "",
    types: ["Physical Object", "Consumable"],
  },
  {
    id: i("205"),
    containerId: c(2),
    name: "Crowbar",
    qty: 1,
    weight: 1.5,
    value: "2 gp",
    tags: ["gear"],
    notes: "",
    types: ["Physical Object", "Gear"],
  },

  // ── Ravenholt Stash ──────────────────────────────────────────────
  {
    id: i("301"),
    containerId: c(4),
    name: "Silver ingot",
    qty: 6,
    weight: 1,
    value: "25 gp",
    tags: ["treasure"],
    notes: "Party funds. Do not spend without a vote.",
    types: ["Physical Object", "Treasure"],
  },
  {
    id: i("302"),
    containerId: c(4),
    name: "Spare cart wheel",
    qty: 1,
    weight: 5,
    value: "3 gp",
    tags: ["gear"],
    notes: "",
    types: ["Physical Object", "Gear"],
  },

  // ── Barrow Chest (world, revealed) ───────────────────────────────
  {
    id: i("401"),
    containerId: c(5),
    name: "Tarnished circlet",
    qty: 1,
    weight: 0.5,
    value: "?",
    tags: ["treasure", "unidentified"],
    notes: "Nobody has been willing to put it on.",
    types: ["Physical Object", "Treasure"],
  },
  {
    id: i("402"),
    containerId: c(5),
    name: "Burial coins",
    qty: 40,
    weight: 0,
    value: "1 sp",
    tags: ["treasure"],
    notes: "",
    types: ["Physical Object", "Treasure"],
  },

  // ── The Sunken Vault (world, UNREVEALED) ─────────────────────────
  // If any of these ever reaches a player's device, the permission layer has
  // failed. There is a test asserting exactly that.
  {
    id: i("501"),
    containerId: c(6),
    name: "Drowned king's signet",
    qty: 1,
    weight: 0,
    value: "???",
    tags: ["plot"],
    notes: "GM eyes only.",
    types: ["Physical Object", "Treasure"],
  },
];

export const SEED_COMMENTS: SeedComment[] = [
  {
    id: "00000000-0000-4000-8000-000000000401",
    containerId: PARTY_WAGON_ID,
    authorId: MILO_ID,
    content: "Cut 2 m off the rope for the barrow. Adjusted the length.",
    parentId: null,
    minutesAgo: 120,
  },
  {
    id: "00000000-0000-4000-8000-000000000402",
    containerId: PARTY_WAGON_ID,
    authorId: GM_ID,
    content: "Noted. It is 8 m now for encumbrance.",
    parentId: "00000000-0000-4000-8000-000000000401",
    minutesAgo: 60,
  },
];

/** Every distinct type name across the seed, for the object_types table. */
export const SEED_TYPE_NAMES: string[] = [
  ...new Set(SEED_ITEMS.flatMap((item) => item.types)),
];

/** Crude but correct English pluralisation for the seed's type names — the
 *  Capacities idea that a type carries both nouns because the UI reads them. */
export function pluralise(singular: string): string {
  if (/(s|x|z|ch|sh)$/i.test(singular)) return `${singular}es`;
  if (/[^aeiou]y$/i.test(singular)) return `${singular.slice(0, -1)}ies`;
  return `${singular}s`;
}
