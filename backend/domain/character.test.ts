import { describe, expect, it } from "vitest";

import {
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  CONDITIONS,
  SKILLS,
  baseChance,
  castsSpells,
  clampSheet,
  conditionFor,
  damageBonus,
  derive,
  emptySheet,
  maxHp,
  maxWp,
  movement,
  sheetFromProperties,
  sheetToProperties,
  skillState,
  skillValue,
} from "./character";

/**
 * The derived maths is the part of the sheet that has no stored value to check
 * itself against — if `baseChance` is wrong, nothing anywhere disagrees with
 * it, it is just quietly the wrong number on every roll for the rest of the
 * campaign. So it is pinned at its boundaries rather than at a midpoint.
 */
describe("base chance", () => {
  it("steps at the rulebook's boundaries, not near them", () => {
    // The table is 1–5, 6–8, 9–12, 13–15, 16–18. Each pair below is the last
    // value of one band and the first of the next.
    expect([baseChance(5), baseChance(6)]).toEqual([3, 4]);
    expect([baseChance(8), baseChance(9)]).toEqual([4, 5]);
    expect([baseChance(12), baseChance(13)]).toEqual([5, 6]);
    expect([baseChance(15), baseChance(16)]).toEqual([6, 7]);
  });

  it("covers the whole legal attribute range", () => {
    for (let score = ATTRIBUTE_MIN; score <= ATTRIBUTE_MAX; score++) {
      const chance = baseChance(score);
      expect(chance).toBeGreaterThanOrEqual(3);
      expect(chance).toBeLessThanOrEqual(7);
    }
  });

  it("never decreases as the attribute rises", () => {
    for (let score = ATTRIBUTE_MIN; score < ATTRIBUTE_MAX; score++) {
      expect(baseChance(score + 1)).toBeGreaterThanOrEqual(baseChance(score));
    }
  });
});

describe("skill value", () => {
  it("doubles the base chance when trained, and only then", () => {
    expect(skillValue(16, false)).toBe(7);
    expect(skillValue(16, true)).toBe(14);
    expect(skillValue(3, false)).toBe(3);
    expect(skillValue(3, true)).toBe(6);
  });
});

describe("damage bonus", () => {
  it("is nothing below 13, D4 through 16, D6 from 17", () => {
    expect(damageBonus(12)).toBeNull();
    expect(damageBonus(13)).toBe("D4");
    expect(damageBonus(16)).toBe("D4");
    expect(damageBonus(17)).toBe("D6");
    expect(damageBonus(18)).toBe("D6");
  });
});

describe("movement", () => {
  /**
   * The seeded elf is the worked example: base 10, AGL 16, so +4 and 14 on the
   * screen. This is the assertion that catches a kin table edited by hand.
   */
  it("adds the agility step to the kin's base", () => {
    expect(movement("elf", 16)).toBe(14);
    expect(movement("halfling", 12)).toBe(8);
    expect(movement("wolfkin", 10)).toBe(12);
  });

  it("steps down as well as up", () => {
    expect(movement("human", 6)).toBe(6); // 10 - 4
    expect(movement("human", 9)).toBe(8); // 10 - 2
    expect(movement("human", 12)).toBe(10); // unchanged
    expect(movement("human", 18)).toBe(14); // 10 + 4
  });

  it("never goes negative, whatever the kin and the roll", () => {
    expect(movement("halfling", 3)).toBeGreaterThanOrEqual(0);
  });
});

describe("hit points and willpower", () => {
  it("are CON and WIL, never stored separately", () => {
    const sheet = emptySheet();
    sheet.attributes.CON = 15;
    sheet.attributes.WIL = 8;
    expect(maxHp(sheet.attributes)).toBe(15);
    expect(maxWp(sheet.attributes)).toBe(8);
  });
});

/**
 * The bug this prevents: lower CON on a full-health character and the sheet
 * renders "12 / 9" — a current value above its own maximum. It has to be
 * caught on READ, because the write that caused it only touched `attributes`
 * and had no reason to look at `hp` at all.
 */
describe("clamping", () => {
  it("pulls current HP down when CON drops beneath it", () => {
    const sheet = emptySheet();
    sheet.attributes.CON = 14;
    sheet.hp = 14;
    sheet.attributes.CON = 9;

    expect(clampSheet(sheet).hp).toBe(9);
  });

  it("does the same for WP against WIL", () => {
    const sheet = emptySheet();
    sheet.attributes.WIL = 6;
    sheet.wp = 14;
    expect(clampSheet(sheet).wp).toBe(6);
  });

  it("leaves a legal sheet alone", () => {
    const sheet = emptySheet();
    sheet.hp = 4;
    expect(clampSheet(sheet).hp).toBe(4);
  });

  it("floors current values at zero rather than letting them go negative", () => {
    const sheet = emptySheet();
    sheet.hp = -3;
    expect(clampSheet(sheet).hp).toBe(0);
  });
});

describe("conditions", () => {
  it("pairs exactly one with each attribute", () => {
    expect(CONDITIONS).toHaveLength(6);
    const attributes = CONDITIONS.map((c) => c.attribute);
    expect(new Set(attributes).size).toBe(6);
  });

  it("can be looked up from the attribute it burdens", () => {
    expect(conditionFor("STR").key).toBe("exhausted");
    expect(conditionFor("CHA").key).toBe("disheartened");
  });
});

describe("skills", () => {
  it("treats an absent skill as untrained rather than missing", () => {
    expect(skillState({}, "Swimming")).toEqual({
      trained: false,
      marked: false,
    });
  });

  it("gives every skill a governing attribute", () => {
    for (const skill of SKILLS) {
      expect(skill.attribute).toBeTruthy();
      expect(baseChance(10)).toBeGreaterThan(0);
    }
  });

  it("opens the spells section only once a magic skill is trained", () => {
    expect(castsSpells({})).toBe(false);
    expect(castsSpells({ Bows: { trained: true, marked: false } })).toBe(false);
    expect(
      castsSpells({ Elementalism: { trained: true, marked: false } }),
    ).toBe(true);
  });
});

/**
 * A character container that predates this feature has NONE of the eight
 * properties, and a hand-edited one may have any of them malformed. Neither
 * may cost more than the section it broke.
 */
describe("reading a stored sheet", () => {
  it("returns a usable default when nothing has ever been stored", () => {
    const sheet = sheetFromProperties(undefined);
    expect(sheet.attributes.STR).toBe(10);
    expect(sheet.hp).toBe(sheet.attributes.CON);
    expect(sheet.spells).toEqual([]);
  });

  it("keeps the good sections when one is malformed", () => {
    const sheet = sheetFromProperties({
      attributes: { STR: 14, CON: 13, AGL: 12, INT: 10, WIL: 11, CHA: 13 },
      spells: "not an array at all",
      profile: { kin: "dwarf", profession: "Smith", age: "old" },
    });

    // The good one survived...
    expect(sheet.attributes.STR).toBe(14);
    // ...the broken one fell back rather than taking the sheet down...
    expect(sheet.spells).toEqual([]);
    // ...and so did the incomplete one, since a half-parsed profile is not a
    // profile.
    expect(sheet.profile.kin).toBe("human");
  });

  it("rejects an out-of-range attribute rather than storing 40 STR", () => {
    const sheet = sheetFromProperties({
      attributes: { STR: 40, CON: 13, AGL: 12, INT: 10, WIL: 11, CHA: 13 },
    });
    expect(sheet.attributes.STR).toBe(10);
  });

  it("clamps a stored HP that sits above its own maximum", () => {
    const sheet = sheetFromProperties({
      attributes: { STR: 10, CON: 9, AGL: 10, INT: 10, WIL: 10, CHA: 10 },
      hp: 99,
    });
    expect(sheet.hp).toBe(9);
  });

  it("round-trips through the property shape unchanged", () => {
    const original = emptySheet();
    original.attributes.AGL = 16;
    original.profile.kin = "elf";
    original.skills = { Bows: { trained: true, marked: true } };

    expect(sheetFromProperties(sheetToProperties(original))).toEqual(original);
  });
});

describe("derive", () => {
  it("computes everything a sheet shows but does not store", () => {
    const sheet = emptySheet();
    sheet.attributes = { STR: 17, CON: 12, AGL: 16, INT: 14, WIL: 14, CHA: 11 };
    sheet.profile.kin = "elf";
    sheet.skills = { Bows: { trained: true, marked: false } };

    expect(derive(sheet)).toEqual({
      maxHp: 12,
      maxWp: 14,
      movement: 14,
      strDamageBonus: "D6",
      aglDamageBonus: "D4",
      castsSpells: false,
      trainedSkills: 1,
    });
  });
});
