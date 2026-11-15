import { describe, expect, it } from "vitest";

import {
  containerPath,
  containerRef,
  isCanonicalRef,
  parseContainerRef,
  queryString,
  sheetPath,
  slugify,
} from "./paths";

const packmule = { id: "0950a1f7-3c7e-4d2b-9a11-5e8c6f3a91c2", name: "Packmule, Honky" };

describe("slugify", () => {
  it("folds accents and keeps other scripts", () => {
    expect(slugify("Packmule, Honky")).toBe("packmule-honky");
    expect(slugify("Équipement")).toBe("equipement");
    expect(slugify("  Hunting & Fishing ")).toBe("hunting-fishing");
    expect(slugify("武器")).toBe("武器");
    expect(slugify("---")).toBe("");
  });
});

describe("container refs", () => {
  it("is the name plus the id's last eight hex digits", () => {
    expect(containerRef(packmule)).toBe("packmule-honky-6f3a91c2");
    expect(containerPath(packmule)).toBe("/c/packmule-honky-6f3a91c2");
    expect(sheetPath(packmule)).toBe("/character/packmule-honky-6f3a91c2");
    expect(containerRef({ id: packmule.id, name: "!!!" })).toBe("6f3a91c2");
  });

  it("parses a slug, a bare suffix and a legacy full id", () => {
    expect(parseContainerRef("packmule-honky-6f3a91c2")).toEqual({ suffix: "6f3a91c2" });
    expect(parseContainerRef("old-name-6F3A91C2")).toEqual({ suffix: "6f3a91c2" });
    expect(parseContainerRef("6f3a91c2")).toEqual({ suffix: "6f3a91c2" });
    expect(parseContainerRef(packmule.id)).toEqual({ id: packmule.id });
    expect(parseContainerRef("%E6%AD%A6%E5%99%A8-6f3a91c2")).toEqual({ suffix: "6f3a91c2" });
    expect(parseContainerRef("not-a-ref")).toBeNull();
    expect(parseContainerRef("%E2")).toBeNull();
  });

  it("knows when a URL is already canonical", () => {
    expect(isCanonicalRef("packmule-honky-6f3a91c2", packmule)).toBe(true);
    expect(isCanonicalRef("honky-6f3a91c2", packmule)).toBe(false);
    expect(isCanonicalRef(packmule.id, packmule)).toBe(false);
  });
});

describe("queryString", () => {
  it("keeps every param, and nothing when there are none", () => {
    expect(queryString({ item: "x", q: "rope", empty: undefined })).toBe("?item=x&q=rope");
    expect(queryString({})).toBe("");
  });
});
