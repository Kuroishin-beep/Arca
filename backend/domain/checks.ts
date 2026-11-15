import {
  type ArmourPiece,
  type AttributeKey,
  type CharacterSheet,
  conditionFor,
} from "./character";

/**
 * Dragonbane checks: roll a d20 against a number, at or under succeeds.
 *
 * A bane adds a d20 and the WORST (highest) die counts. Every bane adds one
 * more die. A natural 1 is a Dragon (always a success, and the skill is marked
 * for advancement); a natural 20 is a Demon (always a failure, and marked too).
 * Pure functions over dice the caller rolled — TaleSpire's tray inside the
 * Symbiote, the browser outside it — so the rules are testable on their own.
 */

export interface CheckResult {
  /** Every d20 thrown, in order. */
  dice: number[];
  /** The die that counts: the highest when there are banes. */
  kept: number;
  target: number;
  success: boolean;
  dragon: boolean;
  demon: boolean;
}

export function resolveCheck(target: number, dice: readonly number[]): CheckResult {
  const kept = dice.length > 0 ? Math.max(...dice) : 20;
  const dragon = kept === 1;
  const demon = kept === 20;
  return {
    dice: [...dice],
    kept,
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
