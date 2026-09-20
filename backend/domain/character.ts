/**
 * The character sheet — SCOPE.md §6.2 S1.
 *
 * This is the stretch item the object-graph model was built for. A character
 * sheet is not a new subsystem: it is the character container's own object,
 * carrying a property set. `containers.object_id` is a FK to `objects`, so the
 * same JSONB machinery that stores an item's weight stores a character's STR,
 * and nothing in the storage layer needed a new table to allow it.
 *
 * ── What is stored, and what is not ────────────────────────────────────────
 *
 * Eight properties are stored: `attributes`, `hp`, `wp`, `deathRolls`,
 * `conditions`, `profile`, `skills`, `spells`. Each is one editing unit on the
 * sheet, which is the point of splitting them at all — ticking a skill writes
 * the skill map and nothing else, so it cannot clobber a profile someone else
 * is editing at the same table.
 *
 * Everything a rulebook DERIVES is derived here, at read time, and never
 * stored (schema doc rule 9, SCOPE.md §5.4): max HP is CON, max WP is WIL, a
 * skill's value is its attribute's base chance doubled if trained, movement is
 * kin plus an AGL step. A stored `maxHp` column is a column that disagrees with
 * CON the first time someone edits CON.
 *
 * ── The tables below are Dragonbane's ──────────────────────────────────────
 *
 * They are transcribed from the rulebook and kept in ONE place each, so a row
 * that turns out to be wrong is a one-line fix rather than a hunt through
 * components. Nothing outside this file hard-codes a game rule.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Attributes
 * ------------------------------------------------------------------ */

/**
 * The six, in the rulebook's own order — which is also the order they are
 * drawn in on the sheet, so the array is the layout as well as the model.
 */
export const ATTRIBUTE_KEYS = [
  "STR",
  "CON",
  "AGL",
  "INT",
  "WIL",
  "CHA",
] as const;
export const AttributeKey = z.enum(ATTRIBUTE_KEYS);
export type AttributeKey = z.infer<typeof AttributeKey>;

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  STR: "Strength",
  CON: "Constitution",
  AGL: "Agility",
  INT: "Intelligence",
  WIL: "Willpower",
  CHA: "Charisma",
};

/** Dragonbane rolls 4D6-drop-lowest, so 3 and 18 are the real bounds. */
export const ATTRIBUTE_MIN = 3;
export const ATTRIBUTE_MAX = 18;

const AttributeScore = z.coerce
  .number()
  .int()
  .min(ATTRIBUTE_MIN)
  .max(ATTRIBUTE_MAX);

export const Attributes = z.object({
  STR: AttributeScore,
  CON: AttributeScore,
  AGL: AttributeScore,
  INT: AttributeScore,
  WIL: AttributeScore,
  CHA: AttributeScore,
});
export type Attributes = z.infer<typeof Attributes>;

/* ------------------------------------------------------------------ *
 * Conditions — one per attribute, which is why they live beside them
 * ------------------------------------------------------------------ */

/**
 * Dragonbane gives every attribute exactly one condition, and a condition
 * imposes a bane on rolls for that attribute. Modelling them as a flat list of
 * six booleans would lose the pairing that makes them legible; pairing them
 * here means the sheet can draw a condition ON its attribute rather than in a
 * separate box the reader has to mentally join.
 */
export const CONDITIONS = [
  { key: "exhausted", label: "Exhausted", attribute: "STR" },
  { key: "sickly", label: "Sickly", attribute: "CON" },
  { key: "dazed", label: "Dazed", attribute: "AGL" },
  { key: "angry", label: "Angry", attribute: "INT" },
  { key: "scared", label: "Scared", attribute: "WIL" },
  { key: "disheartened", label: "Disheartened", attribute: "CHA" },
] as const satisfies readonly {
  key: string;
  label: string;
  attribute: AttributeKey;
}[];

export type ConditionKey = (typeof CONDITIONS)[number]["key"];

export const Conditions = z.object({
  exhausted: z.boolean(),
  sickly: z.boolean(),
  dazed: z.boolean(),
  angry: z.boolean(),
  scared: z.boolean(),
  disheartened: z.boolean(),
});
export type Conditions = z.infer<typeof Conditions>;

/** The condition that burdens a given attribute, for drawing them together. */
export function conditionFor(attribute: AttributeKey) {
  return CONDITIONS.find((c) => c.attribute === attribute)!;
}

/* ------------------------------------------------------------------ *
 * Kin, age, profession
 * ------------------------------------------------------------------ */

/**
 * Kin is an enum rather than free text for one reason: movement is derived
 * from it. A free-text kin would mean guessing a base movement from a string,
 * and a guessed number on a character sheet is worse than no number. `other`
 * exists so a homebrew kin is still expressible — it takes the human base and
 * says so.
 */
export const KINS = [
  { key: "human", label: "Human", movement: 10 },
  { key: "halfling", label: "Halfling", movement: 8 },
  { key: "dwarf", label: "Dwarf", movement: 8 },
  { key: "elf", label: "Elf", movement: 10 },
  { key: "mallard", label: "Mallard", movement: 8 },
  { key: "wolfkin", label: "Wolfkin", movement: 12 },
  { key: "other", label: "Other", movement: 10 },
] as const;

export type KinKey = (typeof KINS)[number]["key"];
export const KinKeySchema = z.enum(
  KINS.map((k) => k.key) as [KinKey, ...KinKey[]],
);

export const AGES = [
  { key: "young", label: "Young" },
  { key: "adult", label: "Adult" },
  { key: "old", label: "Old" },
] as const;
export type AgeKey = (typeof AGES)[number]["key"];
export const AgeKeySchema = z.enum(
  AGES.map((a) => a.key) as [AgeKey, ...AgeKey[]],
);

/**
 * Professions stay free text, and deliberately: unlike kin, nothing is derived
 * from a profession, so an enum would buy nothing and cost every homebrew
 * class. The known ten are offered as a datalist by the UI — a suggestion, not
 * a constraint.
 */
export const PROFESSIONS = [
  "Artisan",
  "Bard",
  "Fighter",
  "Hunter",
  "Knight",
  "Mage",
  "Mariner",
  "Merchant",
  "Scholar",
  "Thief",
] as const;

export const Profile = z.object({
  kin: KinKeySchema,
  profession: z.string().trim().max(60),
  age: AgeKeySchema,
  appearance: z.string().max(500),
  weakness: z.string().max(500),
  memento: z.string().max(200),
});
export type Profile = z.infer<typeof Profile>;

/* ------------------------------------------------------------------ *
 * Skills
 * ------------------------------------------------------------------ */

/**
 * Every skill is governed by an attribute, which is what makes a skill's value
 * derivable rather than stored. `kind` groups them on the sheet the way the
 * rulebook groups them — and it is what gates the spells section: a character
 * with no magic skill trained has no spells to list.
 */
export const SKILLS = [
  // ── Core ─────────────────────────────────────────────────────────
  { name: "Acrobatics", attribute: "AGL", kind: "core" },
  { name: "Awareness", attribute: "INT", kind: "core" },
  { name: "Bartering", attribute: "CHA", kind: "core" },
  { name: "Beast Lore", attribute: "INT", kind: "core" },
  { name: "Bluffing", attribute: "CHA", kind: "core" },
  { name: "Bushcraft", attribute: "INT", kind: "core" },
  { name: "Crafting", attribute: "STR", kind: "core" },
  { name: "Evade", attribute: "AGL", kind: "core" },
  { name: "Healing", attribute: "INT", kind: "core" },
  { name: "Hunting & Fishing", attribute: "AGL", kind: "core" },
  { name: "Languages", attribute: "INT", kind: "core" },
  { name: "Myths & Legends", attribute: "INT", kind: "core" },
  { name: "Performance", attribute: "CHA", kind: "core" },
  { name: "Persuasion", attribute: "CHA", kind: "core" },
  { name: "Riding", attribute: "AGL", kind: "core" },
  { name: "Seamanship", attribute: "INT", kind: "core" },
  { name: "Sleight of Hand", attribute: "AGL", kind: "core" },
  { name: "Sneaking", attribute: "AGL", kind: "core" },
  { name: "Spot Hidden", attribute: "INT", kind: "core" },
  { name: "Swimming", attribute: "AGL", kind: "core" },

  // ── Weapon ───────────────────────────────────────────────────────
  { name: "Axes", attribute: "STR", kind: "weapon" },
  { name: "Bows", attribute: "AGL", kind: "weapon" },
  { name: "Brawling", attribute: "STR", kind: "weapon" },
  { name: "Crossbows", attribute: "AGL", kind: "weapon" },
  { name: "Hammers", attribute: "STR", kind: "weapon" },
  { name: "Knives", attribute: "AGL", kind: "weapon" },
  { name: "Slings", attribute: "AGL", kind: "weapon" },
  { name: "Spears", attribute: "STR", kind: "weapon" },
  { name: "Staves", attribute: "AGL", kind: "weapon" },
  { name: "Swords", attribute: "STR", kind: "weapon" },

  // ── Magic ────────────────────────────────────────────────────────
  { name: "Animism", attribute: "WIL", kind: "magic" },
  { name: "Elementalism", attribute: "WIL", kind: "magic" },
  { name: "Mentalism", attribute: "WIL", kind: "magic" },
] as const satisfies readonly {
  name: string;
  attribute: AttributeKey;
  kind: "core" | "weapon" | "magic";
}[];

export type SkillName = (typeof SKILLS)[number]["name"];
export type SkillKind = (typeof SKILLS)[number]["kind"];

export const SKILL_KINDS: { kind: SkillKind; label: string }[] = [
  { kind: "core", label: "Core skills" },
  { kind: "weapon", label: "Weapon skills" },
  { kind: "magic", label: "Magic" },
];

/**
 * What is stored per skill, and it is deliberately only two booleans.
 *
 * `trained` doubles the value; `marked` is the advancement tick a player earns
 * on a dragon or a demon and spends between sessions. The VALUE is not here on
 * purpose — it is `baseChance(attribute) × (trained ? 2 : 1)`, so a stored
 * value would be a number that silently disagrees with the attribute the
 * moment the attribute changes.
 */
export const SkillState = z.object({
  trained: z.boolean(),
  marked: z.boolean(),
});
export type SkillState = z.infer<typeof SkillState>;

/**
 * Only skills that differ from the default are stored. An untrained, unmarked
 * skill is the absence of a key rather than a row of `false, false` — which
 * keeps the stored bag small and means adding a skill to `SKILLS` later does
 * not require touching a single stored sheet.
 */
export const SkillMap = z.record(z.string(), SkillState);
export type SkillMap = z.infer<typeof SkillMap>;

export const DEFAULT_SKILL_STATE: SkillState = { trained: false, marked: false };

export function skillState(skills: SkillMap, name: string): SkillState {
  return skills[name] ?? DEFAULT_SKILL_STATE;
}

/* ------------------------------------------------------------------ *
 * Spells
 * ------------------------------------------------------------------ */

export const Spell = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "A spell needs a name.").max(80),
  /** Rank 0 is a magic trick, which is why the floor is 0 and not 1. */
  rank: z.coerce.number().int().min(0).max(3),
  school: z.string().trim().max(40),
  notes: z.string().max(500),
});
export type Spell = z.infer<typeof Spell>;

export const Spells = z.array(Spell).max(100);
export type Spells = z.infer<typeof Spells>;

/* ------------------------------------------------------------------ *
 * Death rolls
 * ------------------------------------------------------------------ */

/**
 * Three successes stabilise, three failures kill. Both are capped at three
 * because a fourth tick has no meaning in the rules and a sheet that lets you
 * draw one is a sheet that has stopped describing the game.
 */
export const DEATH_ROLL_SLOTS = 3;

export const DeathRolls = z.object({
  successes: z.coerce.number().int().min(0).max(DEATH_ROLL_SLOTS),
  failures: z.coerce.number().int().min(0).max(DEATH_ROLL_SLOTS),
});
export type DeathRolls = z.infer<typeof DeathRolls>;

/* ------------------------------------------------------------------ *
 * The sheet
 * ------------------------------------------------------------------ */

export const CharacterSheet = z.object({
  attributes: Attributes,
  /** CURRENT hit points. The maximum is CON and is derived, never stored. */
  hp: z.coerce.number().int().min(0),
  /** CURRENT willpower points. The maximum is WIL. */
  wp: z.coerce.number().int().min(0),
  deathRolls: DeathRolls,
  conditions: Conditions,
  profile: Profile,
  skills: SkillMap,
  spells: Spells,
});
export type CharacterSheet = z.infer<typeof CharacterSheet>;

/**
 * What a character container looks like before anybody has filled anything in.
 *
 * 10 across the board rather than 0: an attribute of 0 is not a legal
 * Dragonbane character, and a sheet that opens in an illegal state makes every
 * derived number on it nonsense until six fields are edited. Ten is the middle
 * of the range and gives a working, if unremarkable, adventurer immediately.
 */
export function emptySheet(): CharacterSheet {
  const attributes: Attributes = {
    STR: 10,
    CON: 10,
    AGL: 10,
    INT: 10,
    WIL: 10,
    CHA: 10,
  };
  return {
    attributes,
    hp: attributes.CON,
    wp: attributes.WIL,
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
      kin: "human",
      profession: "",
      age: "adult",
      appearance: "",
      weakness: "",
      memento: "",
    },
    skills: {},
    spells: [],
  };
}

/* ------------------------------------------------------------------ *
 * Derived values — computed at read time, never stored
 * ------------------------------------------------------------------ */

/**
 * The base chance table. Everything a d20 is rolled against on this sheet
 * comes through here, which is why it is one function and not a number copied
 * into six components.
 */
export function baseChance(score: number): number {
  if (score <= 5) return 3;
  if (score <= 8) return 4;
  if (score <= 12) return 5;
  if (score <= 15) return 6;
  return 7;
}

/** Training doubles the base chance. That is the whole rule. */
export function skillValue(score: number, trained: boolean): number {
  return trained ? baseChance(score) * 2 : baseChance(score);
}

/** `null` rather than `"—"`: the absence of a bonus is data, not a glyph. */
export function damageBonus(score: number): "D4" | "D6" | null {
  if (score >= 17) return "D6";
  if (score >= 13) return "D4";
  return null;
}

export function maxHp(attributes: Attributes): number {
  return attributes.CON;
}

export function maxWp(attributes: Attributes): number {
  return attributes.WIL;
}

/** Kin sets the base; AGL moves it in steps of two. */
export function movement(kin: KinKey, agility: number): number {
  const base = KINS.find((k) => k.key === kin)?.movement ?? 10;
  const step =
    agility <= 6 ? -4 : agility <= 9 ? -2 : agility <= 12 ? 0 : agility <= 15 ? 2 : 4;
  return Math.max(0, base + step);
}

/** True once any magic skill is trained — the gate on the spells section. */
export function castsSpells(skills: SkillMap): boolean {
  return SKILLS.filter((s) => s.kind === "magic").some(
    (s) => skillState(skills, s.name).trained,
  );
}

/**
 * Bring a sheet back inside its own rules.
 *
 * Current HP has no lower bound of its own but a hard upper one of CON, and CON
 * is editable — so lowering CON has to bring HP down with it or the sheet
 * renders 12/9. Done on READ rather than only on write, because a sheet written
 * by an older version of this code, or edited from two panels at once, has to
 * land somewhere legal regardless of how it got there.
 */
export function clampSheet(sheet: CharacterSheet): CharacterSheet {
  const hpCeiling = maxHp(sheet.attributes);
  const wpCeiling = maxWp(sheet.attributes);
  return {
    ...sheet,
    hp: Math.min(Math.max(0, sheet.hp), hpCeiling),
    wp: Math.min(Math.max(0, sheet.wp), wpCeiling),
  };
}

/**
 * Everything a component would otherwise re-derive, in one call.
 *
 * Exported as a plain function over a sheet rather than baked into the view, so
 * the client can recompute it against OPTIMISTIC state — the moment someone
 * steps CON up, max HP has to follow on screen without waiting for the server
 * to answer.
 */
export interface DerivedCharacter {
  maxHp: number;
  maxWp: number;
  movement: number;
  strDamageBonus: "D4" | "D6" | null;
  aglDamageBonus: "D4" | "D6" | null;
  castsSpells: boolean;
  trainedSkills: number;
}

export function derive(sheet: CharacterSheet): DerivedCharacter {
  return {
    maxHp: maxHp(sheet.attributes),
    maxWp: maxWp(sheet.attributes),
    movement: movement(sheet.profile.kin, sheet.attributes.AGL),
    strDamageBonus: damageBonus(sheet.attributes.STR),
    aglDamageBonus: damageBonus(sheet.attributes.AGL),
    castsSpells: castsSpells(sheet.skills),
    trainedSkills: SKILLS.filter((s) => skillState(sheet.skills, s.name).trained)
      .length,
  };
}

/* ------------------------------------------------------------------ *
 * Reading a stored sheet
 * ------------------------------------------------------------------ */

/**
 * Rebuild a sheet from the eight property values, tolerating every one of them
 * being absent or wrong.
 *
 * This is the one place that meets raw JSONB, and it has to assume the worst:
 * a character container that predates this feature has NONE of these
 * properties, and a hand-edited one may have any of them malformed. Parsing
 * per-section with a fallback to the default means a broken `spells` array
 * costs the spells list, not the whole sheet.
 */
export function sheetFromProperties(
  props: Record<string, unknown> | undefined,
): CharacterSheet {
  const empty = emptySheet();
  if (!props) return empty;

  const section = <T>(schema: z.ZodType<T>, raw: unknown, fallback: T): T => {
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : fallback;
  };

  const attributes = section(Attributes, props.attributes, empty.attributes);

  return clampSheet({
    attributes,
    hp: section(CharacterSheet.shape.hp, props.hp, attributes.CON),
    wp: section(CharacterSheet.shape.wp, props.wp, attributes.WIL),
    deathRolls: section(DeathRolls, props.deathRolls, empty.deathRolls),
    conditions: section(Conditions, props.conditions, empty.conditions),
    profile: section(Profile, props.profile, empty.profile),
    skills: section(SkillMap, props.skills, empty.skills),
    spells: section(Spells, props.spells, empty.spells),
  });
}

/** The inverse: a sheet as the eight property values it is stored in. */
export function sheetToProperties(
  sheet: CharacterSheet,
): Record<string, unknown> {
  return {
    attributes: sheet.attributes,
    hp: sheet.hp,
    wp: sheet.wp,
    deathRolls: sheet.deathRolls,
    conditions: sheet.conditions,
    profile: sheet.profile,
    skills: sheet.skills,
    spells: sheet.spells,
  };
}

/** The property names this feature owns, for seeding and for on-demand
 *  definition creation against a database seeded before it existed. */
export const CHARACTER_PROPERTY_NAMES = [
  "attributes",
  "hp",
  "wp",
  "deathRolls",
  "conditions",
  "profile",
  "skills",
  "spells",
] as const;
