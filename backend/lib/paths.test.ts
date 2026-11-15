import { describe, expect, it } from "vitest";

import {
  containerPath,
  containerRef,
  isCanonicalRef,
  containerRefs,
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
  it("is just the name, with no id noise", () => {
    expect(containerRef(packmule)).toBe("packmule-honky");
    expect(containerPath(packmule)).toBe("/c/packmule-honky");
    expect(sheetPath(packmule)).toBe("/character/packmule-honky");
    expect(containerRef({ id: packmule.id, name: "!!!" })).toBe("6f3a91c2");
  });

  it("adds the id tail only to names that clash in the campaign", () => {
    const refs = containerRefs([
      packmule,
      { id: "00000000-0000-4000-8000-0000000000aa", name: "Rope" },
      { id: "00000000-0000-4000-8000-0000000000bb", name: "rope!" },
    ]);
    expect(refs.get(packmule.id)).toBe("packmule-honky");
    expect(refs.get("00000000-0000-4000-8000-0000000000aa")).toBe("rope-000000aa");
    expect(refs.get("00000000-0000-4000-8000-0000000000bb")).toBe("rope-000000bb");
  });

  it("prefers the repository's ref when there is one", () => {
    expect(containerRef({ ...packmule, ref: "packmule-honky-6f3a91c2" })).toBe(
      "packmule-honky-6f3a91c2",
    );
  });

  it("knows when a URL is already canonical", () => {
    expect(isCanonicalRef("packmule-honky", packmule)).toBe(true);
    expect(isCanonicalRef("packmule-honky-6f3a91c2", packmule)).toBe(false);
    expect(isCanonicalRef(packmule.id, packmule)).toBe(false);
  });
});

describe("queryString", () => {
  it("keeps every param, and nothing when there are none", () => {
    expect(queryString({ item: "x", q: "rope", empty: undefined })).toBe("?item=x&q=rope");
    expect(queryString({})).toBe("");
  });
});
