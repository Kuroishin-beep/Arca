import { describe, expect, it } from "vitest";

import { parseDiceNotation } from "@/lib/dice";

/**
 * The parser exists so a player can see what will be thrown BEFORE it is
 * thrown — an unintended roll cannot be taken back at a real table. So these
 * tests care as much about the reported range and the error position as they do
 * about accept/reject.
 */
describe("parseDiceNotation", () => {
  it("parses a bare die", () => {
    const r = parseDiceNotation("d20");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.min).toBe(1);
    expect(r.max).toBe(20);
  });

  it("parses count and modifier", () => {
    const r = parseDiceNotation("2d6+3");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.min).toBe(5);
    expect(r.max).toBe(15);
    expect(r.terms).toHaveLength(2);
  });

  it("parses a negative modifier", () => {
    const r = parseDiceNotation("d100-5");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.min).toBe(-4);
    expect(r.max).toBe(95);
  });

  it("parses keep-highest and narrows the range accordingly", () => {
    const r = parseDiceNotation("4d6kh3");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Three dice are kept, so the range is 3–18, not 4–24.
    expect(r.min).toBe(3);
    expect(r.max).toBe(18);
  });

  it("parses a chain of terms", () => {
    const r = parseDiceNotation("2d6+1d4+3");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.terms).toHaveLength(3);
    expect(r.min).toBe(6);
    expect(r.max).toBe(19);
  });

  it("rejects a doubled operator and names the position", () => {
    const r = parseDiceNotation("2d6++x");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.position).toBe(4);
    expect(r.message).toContain("position 5");
  });

  it("rejects nonsense with a suggestion", () => {
    const r = parseDiceNotation("banana");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("2d6+3");
  });

  it("rejects keeping more dice than are rolled", () => {
    const r = parseDiceNotation("2d6kh5");
    expect(r.ok).toBe(false);
  });

  it("rejects an empty string rather than throwing", () => {
    expect(parseDiceNotation("   ").ok).toBe(false);
  });
});
