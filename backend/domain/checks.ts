import {
  type ArmourPiece,
  type AttributeKey,
  type CharacterSheet,
  conditionFor,
} from "./character";

/**
 * Dragonbane checks: roll a d20 against a number, at or under succeeds.
 *
 * A bane adds a d20 and the WORST (highest) die counts; every bane adds one
 * more die. A boon adds a d20 and the BEST (lowest) die counts. The player
 * says which before rolling — Arca only suggests, from conditions and armour.
 * A natural 1 is a Dragon (always a success, and the skill is marked for
 * advancement); a natural 20 is a Demon (always a failure, and marked too).
 * Pure functions over dice the caller rolled — TaleSpire's tray inside the
 * Symbiote, the browser outside it — so the rules are testable on their own.
 */

/** How a check is rolled: with a boon, plainly, or with a bane. */
export type Edge = "boon" | "normal" | "bane";

export interface CheckResult {
  /** Every d20 thrown, in order. */
  dice: number[];
  /** The die that counts: the lowest with a boon, the highest with a bane. */
  kept: number;
  edge: Edge;
  target: number;
  success: boolean;
  dragon: boolean;
  demon: boolean;
}

export function resolveCheck(
  target: number,
  dice: readonly number[],
  edge: Edge = dice.length > 1 ? "bane" : "normal",
): CheckResult {
  const kept =
    dice.length === 0 ? 20 : edge === "boon" ? Math.min(...dice) : Math.max(...dice);
  const dragon = kept === 1;
  const demon = kept === 20;
  return {
    dice: [...dice],
    kept,
    edge,
    target,
    success: dragon || (!demon && kept <= target),
    dragon,
    demon,
  };
}

/** Whether a free-text "bane on" list names this skill: "Sneaking, Evade". */
function namesSkill(list: string, skill: string): boolean {
  const wanted = skill.trim().toLowerCase();
  return list
    .split(/[,;/]|\band\b/i)
    .map((part) => part.trim().toLowerCase())
    .some((part) => part !== "" && part === wanted);
}

/**
 * Why a check has banes, one reason per die added: the condition on its
 * attribute, and armour or a helmet that lists the skill. Empty when the roll
 * is a plain d20.
 */
export function banesFor(
  sheet: Pick<CharacterSheet, "conditions" | "protection">,
  attribute: AttributeKey,
  skill?: string,
): string[] {
  const reasons: string[] = [];
  const condition = conditionFor(attribute);
  if (sheet.conditions[condition.key]) reasons.push(condition.label);
  if (skill) {
    const { armour, helmet } = sheet.protection;
    if (namesSkill(armour.banes, skill)) reasons.push(armour.name.trim() || "Armour");
    if (namesSkill(helmet.banes, skill)) reasons.push(helmet.name.trim() || "Helmet");
  }
  return reasons;
}

/** `count` d20s from the browser's CSPRNG — outside TaleSpire only. */
export function rollD20s(count: number): number[] {
  const values = new Uint32Array(count);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => (v % 20) + 1);
}

/**
 * The core rules' armour and helmets, so picking "Chainmail" from your pack
 * fills in its rating and banes. Matched on the item's name, most specific
 * first; a name that matches nothing keeps whatever the player typed. A table
 * that plays it differently just edits the fields after picking.
 */
const ARMOUR_DEFAULTS: { match: RegExp; piece: Omit<ArmourPiece, "name">; slot: "armour" | "helmet" }[] = [
  { match: /great\s*helm/i, slot: "helmet", piece: { rating: 2, banes: "Awareness" } },
  { match: /helm/i, slot: "helmet", piece: { rating: 1, banes: "" } },
  { match: /plate/i, slot: "armour", piece: { rating: 6, banes: "Acrobatics, Evade, Sneaking" } },
  { match: /chain/i, slot: "armour", piece: { rating: 4, banes: "Evade, Sneaking" } },
  { match: /studded/i, slot: "armour", piece: { rating: 2, banes: "Sneaking" } },
  { match: /leather/i, slot: "armour", piece: { rating: 1, banes: "" } },
];

/** What a picked item fills in: the defaults for a known armour, else nothing. */
export function armourDefaultsFor(
  itemName: string,
  slot: "armour" | "helmet",
): Omit<ArmourPiece, "name"> | null {
  const known = ARMOUR_DEFAULTS.find((a) => a.slot === slot && a.match.test(itemName));
  return known ? { ...known.piece } : null;
}

/**
 * The roll's net modifier: banes negative, boons positive, 0 a plain d20.
 * Boons and banes cancel one for one, so the table states the NET — the
 * scale on the sheet runs -3…+3. Each step is one more d20.
 */
export const MODIFIERS = [-3, -2, -1, 0, 1, 2, 3] as const;
export type Modifier = (typeof MODIFIERS)[number];

export function edgeOf(modifier: number): Edge {
  return modifier < 0 ? "bane" : modifier > 0 ? "boon" : "normal";
}

/** d20s thrown for a net modifier: one, plus one per boon or bane. */
export function diceForModifier(modifier: number): number {
  return 1 + Math.abs(modifier);
}

/** The suggestion for the scale: one bane per reason, capped at -3. */
export function suggestedModifier(banes: readonly string[]): Modifier {
  return (banes.length === 0 ? 0 : -Math.min(3, banes.length)) as Modifier;
}

/**
 * Which weapon skill an item is used with, read from its name — Arca's items
 * carry no skill field, and the name ("Bow, Short", "Dagger", "Longsword") is
 * what the catalogue gives. `null` when nothing matches; most specific first,
 * so a crossbow is not a bow.
 */
const WEAPON_SKILLS: { match: RegExp; skill: string }[] = [
  { match: /crossbow/i, skill: "Crossbows" },
  { match: /bow/i, skill: "Bows" },
  { match: /knife|dagger|dirk|stiletto/i, skill: "Knives" },
  { match: /sling/i, skill: "Slings" },
  { match: /staff|staves|quarterstaff/i, skill: "Staves" },
  { match: /spear|lance|trident|pike|halberd/i, skill: "Spears" },
  { match: /hammer|mace|club|flail|morning\s*star|maul/i, skill: "Hammers" },
  { match: /axe/i, skill: "Axes" },
  { match: /sword|blade|sabre|saber|scimitar|rapier|falchion/i, skill: "Swords" },
  { match: /fist|unarmed|brawl|gauntlet/i, skill: "Brawling" },
];

export function weaponSkillFor(itemName: string): string | null {
  return WEAPON_SKILLS.find((w) => w.match.test(itemName))?.skill ?? null;
}

/**
 * The damage bonus a weapon adds: STR's for a STR-skill weapon, AGL's for an
 * AGL-skill weapon, none for a crossbow (its mechanism, not the arm, drives
 * the bolt). An unrecognised weapon is treated as a STR weapon.
 */
export function weaponDamageBonus(
  itemName: string,
  bonuses: { STR: "D4" | "D6" | null; AGL: "D4" | "D6" | null },
): { bonus: "D4" | "D6" | null; attribute: "STR" | "AGL" | null } {
  const skill = weaponSkillFor(itemName);
  if (skill === "Crossbows") return { bonus: null, attribute: null };
  const agl = skill === "Bows" || skill === "Knives" || skill === "Slings" || skill === "Staves";
  const attribute = agl ? "AGL" : "STR";
  return { bonus: bonuses[attribute], attribute };
}
