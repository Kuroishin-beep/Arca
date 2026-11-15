import { describe, expect, it } from "vitest";

import { isSymbiote, rollDice, toTrayNotation } from "./talespire";

describe("toTrayNotation", () => {
  it("lower-cases Dragonbane's printed dice and adds the implicit count", () => {
    expect(toTrayNotation("D20")).toBe("1d20");
    expect(toTrayNotation("2D6")).toBe("2d6");
    expect(toTrayNotation("D8 + D4")).toBe("1d8+1d4");
    expect(toTrayNotation("2d6-d4")).toBe("2d6-1d4");
    expect(toTrayNotation("1d20+3")).toBe("1d20+3");
  });
});

describe("outside TaleSpire", () => {
  it("is not a Symbiote and delivers no roll", async () => {
    expect(isSymbiote()).toBe(false);
    expect(await rollDice("1d20", "Awareness")).toBe(false);
  });
});
