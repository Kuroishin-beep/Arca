import { test, expect, type Page, type Browser } from "@playwright/test";

import { KOVA_CONTAINER_ID } from "../backend/db/seed-data";

/**
 * The character sheet — SCOPE.md S1.
 *
 * Three things are worth a browser rather than a unit test, because all three
 * cross the client/server seam that the unit tests stop at:
 *
 *   1. An edit made by clicking survives a reload. Every control on the sheet
 *      is optimistic, and an optimistic control that never actually saved looks
 *      identical to one that did until the page is reloaded.
 *   2. A derived number follows the attribute it is derived FROM, on screen.
 *   3. A player cannot reach another player's sheet — the permission rule, run
 *      through a real session rather than a constructed principal.
 */

const ACCOUNTS: Record<string, { email: string; password: string }> = {
  Ravna: { email: "ravna@ravenholt.example", password: "brass-lantern-4821" },
  Kova: { email: "kova@ravenholt.example", password: "iron-lantern-9037" },
  Milo: { email: "milo@ravenholt.example", password: "clay-lantern-5518" },
};

async function signInAs(browser: Browser, displayName: string): Promise<Page> {
  const account = ACCOUNTS[displayName];
  if (!account) throw new Error(`No account fixture for ${displayName}.`);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/signin");

  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  // The confirm field lives behind a disclosure now — sign-in proper is
  // email + password, and this is the first-time-only half.
  await page.getByText(/first time signing in/i).click();
  await page.locator("#confirmPassword").fill(account.password);

  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/c\//);
  return page;
}

/**
 * Opens a sheet by walking from the container to it, rather than by typing the
 * sheet's URL — so this also covers the link existing, which it did not until
 * the sheet stopped being reachable only by URL.
 *
 * The container is addressed by its seeded id and not by name, for two
 * reasons: sign-in deliberately lands on a PARTY container (see
 * `signInAsAction`), so the sheet link is never on the first page; and a
 * character container is named for its character, which one of the tests below
 * renames.
 */
async function openSheet(page: Page, containerId: string): Promise<void> {
  await page.goto(`/c/${containerId}`);
  await page.getByRole("link", { name: /character sheet/i }).first().click();
  await page.waitForURL(/\/character\//);
}

/**
 * Perform an edit and wait for it to actually reach the server.
 *
 * Every control on this sheet is optimistic, so the screen updates before the
 * write lands. A test that clicks and immediately reloads is racing its own
 * Server Action — and when it loses, the navigation cancels the request and the
 * failure reads as "the feature does not save" rather than "the test was too
 * fast". Server Actions POST to the current URL, so that response is the
 * signal.
 */
async function saved(page: Page, edit: () => Promise<unknown>): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/character/"),
    ),
    edit(),
  ]);
}

test.describe("the character sheet", () => {
  test("an edit made by clicking survives a reload", async ({ browser }) => {
    const kova = await signInAs(browser, "Kova");
    await openSheet(kova, KOVA_CONTAINER_ID);

    const hitPoints = kova
      .locator("section")
      .filter({ hasText: "Hit points" })
      .first();

    const before = Number(
      (await hitPoints.locator("p.font-serif").first().innerText())
        .split("/")[0]!
        .trim(),
    );

    await saved(kova, () =>
      kova.getByRole("button", { name: /lose one hit points/i }).click(),
    );

    // The assertion that matters is after a RELOAD. Before one, an optimistic
    // update that never reached the server looks exactly like one that did.
    await kova.reload();

    await expect(hitPoints.locator("p.font-serif").first()).toContainText(
      String(before - 1),
    );

    await kova.context().close();
  });

  test("a trained skill's value follows the attribute it derives from", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    await openSheet(kova, KOVA_CONTAINER_ID);

    // Swords is governed by STR. Train it, then move STR and watch the value.
    const swords = kova.locator("li").filter({ hasText: "Swords" }).first();
    const trained = swords.locator('input[type="checkbox"]').first();
    if (!(await trained.isChecked())) {
      await saved(kova, () => trained.check());
    }

    await saved(kova, () => kova.locator("#attr-STR").fill("16"));
    await kova.reload();

    // STR 16 sits in the 16–18 band: base chance 7, doubled by training.
    await expect(
      kova.locator("li").filter({ hasText: "Swords" }).first(),
    ).toContainText("14");

    // And STR's own box agrees about the base chance, which is the point of
    // deriving it in one place.
    //
    // Scoped to the box CONTAINING the STR input rather than to the attributes
    // section: Kova's AGL is also 16, so a section-wide search for "Base chance
    // 7" would pass whether or not STR had moved at all. Two divs wrap that
    // input — the box and the stepper — and the box is the outer one.
    await expect(
      kova
        .locator("div.rounded-md")
        .filter({ has: kova.locator("#attr-STR") })
        .first(),
    ).toContainText("Base chance 7");

    await kova.context().close();
  });

  test("lowering CON brings current hit points down with it", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    await openSheet(kova, KOVA_CONTAINER_ID);

    // Full health first, whatever the previous test left behind.
    const rest = kova.getByRole("button", { name: /^rest$/i }).first();
    if (await rest.isEnabled()) await saved(kova, () => rest.click());

    await saved(kova, () => kova.locator("#attr-CON").fill("7"));
    await kova.reload();

    const hitPoints = kova
      .locator("section")
      .filter({ hasText: "Hit points" })
      .first();

    // Not 7 of some older maximum: both halves have to move together, or the
    // sheet renders a current value above its own cap.
    await expect(hitPoints.locator("p.font-serif").first()).toContainText(
      "7 / 7",
    );

    await kova.context().close();
  });

  test("a player cannot open another player's sheet", async ({ browser }) => {
    // Kova finds her own sheet's URL, the honest way.
    const kova = await signInAs(browser, "Kova");
    await openSheet(kova, KOVA_CONTAINER_ID);
    const kovasSheet = new URL(kova.url()).pathname;
    await kova.context().close();

    const milo = await signInAs(browser, "Milo");
    const response = await milo.goto(kovasSheet);

    // 404, not 403: telling a player that a sheet EXISTS and is closed to them
    // is the same small leak the workspace refuses to make about containers
    // (SCOPE.md §12.3).
    expect(response?.status()).toBe(404);
    await expect(milo.locator("#character-name")).toHaveCount(0);

    await milo.context().close();
  });

  test("the GM can open a player's sheet and edit it", async ({ browser }) => {
    const kova = await signInAs(browser, "Kova");
    await openSheet(kova, KOVA_CONTAINER_ID);
    const kovasSheet = new URL(kova.url()).pathname;
    await kova.context().close();

    const gm = await signInAs(browser, "Ravna");
    await gm.goto(kovasSheet);

    await expect(gm.locator("#character-name")).toBeVisible();
    await expect(
      gm.getByRole("button", { name: /lose one hit points/i }),
    ).toBeEnabled();

    await gm.context().close();
  });

  /**
   * The naming rule, end to end: one string, and every screen that shows this
   * character reads it. If this breaks, the sheet and the sidebar have started
   * disagreeing about who somebody is.
   */
  test("renaming on the sheet renames in the sidebar", async ({ browser }) => {
    const kova = await signInAs(browser, "Kova");
    await openSheet(kova, KOVA_CONTAINER_ID);

    const renamed = `Kova ${Date.now().toString().slice(-5)}`;
    await kova.locator("#character-name").fill(renamed);
    await saved(kova, () => kova.locator("#character-name").press("Enter"));

    // Back to the inventory, where the sidebar and the heading both read the
    // container's name — the same field the sheet just wrote.
    await kova.getByRole("link", { name: /back to inventory/i }).click();
    await kova.waitForURL(/\/c\//);

    await expect(kova.getByRole("heading", { name: renamed })).toBeVisible();
    await expect(
      kova
        .getByRole("navigation", { name: "Containers" })
        .filter({ hasText: renamed })
        .first(),
    ).toBeVisible();

    // Put it back. The suite seeds once for the whole run, so a test that
    // leaves a renamed character behind is a test that changes what the next
    // run starts from.
    await openSheet(kova, KOVA_CONTAINER_ID);
    await kova.locator("#character-name").fill("Kova");
    await saved(kova, () => kova.locator("#character-name").press("Enter"));

    await kova.context().close();
  });
  /**
   * Found by an accessibility sweep: the visible name is an editable field, so
   * the page had no <h1>; the vitals panels were <h3> with no <h2> above them;
   * and the Kin, Age and Profession chips stripped the focus outline the rest
   * of the app draws, leaving a keyboard user with no idea where they were.
   */
  test("the sheet has a heading outline and visible keyboard focus", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    await openSheet(kova, KOVA_CONTAINER_ID);

    await expect(kova.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(
      kova.getByRole("heading", { level: 2, name: /hit points/i }),
    ).toBeVisible();
    await expect(
      kova.getByRole("heading", { level: 2, name: /death rolls/i }),
    ).toBeVisible();

    for (const id of ["kin", "age", "profession"]) {
      await kova.locator(`#${id}`).focus();
      const outline = await kova
        .locator(`#${id}`)
        .evaluate((el) => getComputedStyle(el.parentElement!).outlineStyle);
      expect(outline, `#${id} must show a focus ring`).not.toBe("none");
    }

    await kova.context().close();
  });
});

test.describe("character sheet polish", () => {
  test("the page never scrolls past the app shell", async ({ browser }) => {
    // The advancement-mark labels held sr-only spans with no positioned
    // ancestor, so they hung off the document and added ~670px of blank
    // scroll beneath the shell. The sheet scrolls inside its own pane only.
    const page = await signInAs(browser, "Kova");
    for (const size of [
      { width: 1280, height: 900 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(size);
      await page.goto(`/character/${KOVA_CONTAINER_ID}`);
      await expect(page.getByRole("heading", { name: "Skills", exact: true })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test("the tab is titled after the character", async ({ browser }) => {
    const page = await signInAs(browser, "Kova");
    await page.goto(`/character/${KOVA_CONTAINER_ID}`);
    const heading = await page.locator("h1").first().textContent();
    const name = (heading ?? "").replace(/^Character sheet:\s*/, "").trim();
    expect(name.length).toBeGreaterThan(0);
    await expect(page).toHaveTitle(`${name} · Arca`);
  });

  test("an equipment row opens that item in the inventory", async ({
    browser,
  }) => {
    const page = await signInAs(browser, "Kova");
    await page.goto(`/character/${KOVA_CONTAINER_ID}`);
    const equipment = page.locator("section", {
      has: page.getByRole("heading", { name: "Equipment" }),
    });
    const first = equipment.getByRole("row").nth(1).getByRole("link");
    const itemName = (await first.textContent())?.trim() ?? "";
    await first.click();
    await page.waitForURL(
      (url) =>
        // Readable URL: just the name.
        url.pathname === "/c/kova" &&
        url.searchParams.has("item"),
    );
    await expect(
      page.getByRole("heading", { name: itemName }).first(),
    ).toBeVisible();
  });
});

test.describe("the Dragonbane sheet", () => {
  test("money and armour edits survive a reload", async ({ browser }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);

    const gold = kova.locator("#money-gold");
    const before = Number(await gold.inputValue());
    await saved(kova, () => gold.fill(String(before + 3)));

    await kova.locator("#helmet-name").fill("Open helmet");
    await saved(kova, () => kova.locator("#helmet-name").press("Enter"));

    await kova.reload();
    await expect(kova.locator("#money-gold")).toHaveValue(String(before + 3));
    await expect(kova.locator("#helmet-name")).toHaveValue("Open helmet");
    await kova.context().close();
  });

  test("the inventory counts slots from STR and keeps worn armour out", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);
    const equipment = kova.locator("section", {
      has: kova.getByRole("heading", { name: "Equipment" }),
    });
    // Half STR, rounded up. Read rather than assumed: another test in this
    // file raises Kova's STR, and the store is shared across the run.
    const strength = Number(await kova.locator("#attr-STR").inputValue());
    const slots = Math.ceil(strength / 2);
    await expect(equipment).toContainText(new RegExp(`[0-9]+ / ${slots} +slots`));
    // Leather armour is the armour named on her sheet, so it is worn, not packed.
    const worn = equipment.locator("div", {
      has: kova.getByRole("heading", { name: "Worn" }),
    });
    await expect(worn.getByRole("link", { name: "Leather armour" })).toBeVisible();
    await expect(equipment.getByRole("heading", { name: "Tiny items" })).toBeVisible();
    await kova.context().close();
  });

  test("in a browser tab a skill's d20 rolls the check and says how it went", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);
    const row = kova.locator("li").filter({ hasText: "Awareness" }).first();
    await row.getByRole("button", { name: /^roll awareness \(\d+\)/i }).click();

    const toast = kova.getByRole("status").filter({ hasText: "Awareness" });
    await expect(toast).toContainText(/rolled \d+ vs \d+/);
    await expect(toast).toContainText(/success|failure|dragon|demon/i);
    await kova.context().close();
  });

  test("inside TaleSpire the check is thrown in the tray, read back, and a Dragon marks the skill", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    // A stand-in for TaleSpire: records what reaches the tray, then reports
    // the throw back the way the bridge does — here, a natural 1.
    await kova.addInitScript(() => {
      const w = window as unknown as {
        TS: unknown;
        trayCalls: { name: string; roll: string }[][];
      };
      w.trayCalls = [];
      w.TS = {
        dice: {
          putDiceInTray: (descriptors: { name: string; roll: string }[]) => {
            w.trayCalls.push(descriptors);
            window.setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent("arca:ts-roll", {
                  detail: {
                    kind: "rollResults",
                    payload: { rollId: "roll-1", resultsGroups: descriptors.map(() => ({ v: 1 })) },
                  },
                }),
              );
            }, 50);
            return Promise.resolve("roll-1");
          },
          evaluateDiceResultsGroup: (group: { v: number }) => Promise.resolve(group.v),
        },
      };
    });
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);

    const row = kova.locator("li").filter({ hasText: "Awareness" }).first();
    const mark = row.getByRole("checkbox", { name: /advancement mark for awareness/i });
    if (await mark.isChecked()) await saved(kova, () => mark.uncheck());

    await saved(kova, () => row.getByRole("button", { name: /^roll awareness \(\d+\)/i }).click());

    await expect
      .poll(() =>
        kova.evaluate(() => (window as unknown as { trayCalls: unknown[] }).trayCalls),
      )
      .toEqual([[{ name: expect.stringMatching(/^Awareness \(\d+\)$/), roll: "1d20" }]]);
    const toast = kova.getByRole("status").filter({ hasText: "Awareness" });
    await expect(toast).toContainText("Dragon!");
    await expect(toast).toContainText(/marked for advancement/i);
    await expect(mark).toBeChecked();

    await kova.reload();
    await expect(
      kova
        .locator("li")
        .filter({ hasText: "Awareness" })
        .first()
        .getByRole("checkbox", { name: /advancement mark for awareness/i }),
    ).toBeChecked();
    await kova.context().close();
  });

  test("using a heroic ability spends its WP, and can be undone", async ({ browser }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);
    const name = `Probe ${Date.now().toString().slice(-5)}`;
    const willpower = kova.locator("section").filter({
      has: kova.getByRole("heading", { level: 2, name: /willpower/i }),
    });
    const wp = async () => Number((await willpower.locator("p.font-serif").first().innerText()).split("/")[0]);

    await saved(kova, () => kova.getByRole("button", { name: /add ability/i }).click());
    const field = kova.locator('input[id^="ability-name-"]');
    await field.fill(name);
    await saved(kova, () => field.press("Enter"));
    await kova.getByRole("button", { name: /^done$/i }).click();

    const before = await wp();
    const card = kova.locator("li").filter({ has: kova.getByRole("heading", { name, level: 3 }) });
    await saved(kova, () => card.getByRole("button", { name: /^use \(3 wp\)$/i }).click());
    await expect.poll(wp).toBe(before - 3);

    await saved(kova, () => card.getByRole("button", { name: /^undo$/i }).click());
    await expect.poll(wp).toBe(before);

    await card.getByRole("button", { name: `Edit ${name}` }).click();
    await saved(kova, () => kova.getByRole("button", { name: /^remove$/i }).click());
    await kova.context().close();
  });

  test("picking armour from the pack fills in its rating", async ({ browser }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);
    await saved(kova, () => kova.locator("#armour-pick").selectOption("Leather armour"));
    await expect(kova.locator("#armour-name")).toHaveValue("Leather armour");
    await expect(kova.locator("#armour-rating")).toHaveValue("1");
    await kova.context().close();
  });
});

test.describe("inside TaleSpire", () => {
  test("TaleSpire's colours replace Arca's, and the theme toggle goes", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    // What TaleSpire's "colorStyles" extra provides, then Arca's own bridge —
    // in the order the manifest lists them.
    await kova.addInitScript(() => {
      const style = document.createElement("style");
      document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
      style.textContent =
        ":root{--ts-background-primary:rgb(10, 20, 30);--ts-background-secondary:rgb(20,30,40);" +
        "--ts-background-tertiary:rgb(30,40,50);--ts-color-primary:rgb(240,240,240);" +
        "--ts-color-secondary:rgb(180,180,180);--ts-accent-primary:rgb(200,120,40);" +
        "--ts-accent-hover:rgb(220,140,60);--ts-accent-background:rgb(60,40,20);" +
        "--ts-accessibility-border:rgb(120,120,120);--ts-color-danger:rgb(220,60,60);}";
    });
    await kova.addInitScript({ path: "symbiote/arca-bridge.js" });
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);

    await expect(kova.locator("html")).toHaveAttribute("data-ts-colors", "");
    await expect
      .poll(() => kova.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe("rgb(10, 20, 30)");
    await expect(kova.locator("[data-theme-toggle]")).toBeHidden();
    await kova.context().close();
  });

  test("a plain browser tab keeps Arca's palette", async ({ browser }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);
    await expect(kova.locator("html")).not.toHaveAttribute("data-ts-colors", /.*/);
    await expect(kova.locator("[data-theme-toggle]")).toBeVisible();
    await kova.context().close();
  });
});

test.describe("readable URLs", () => {
  test("an old id link lands on the readable address, keeping the view", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    const suffix = KOVA_CONTAINER_ID.slice(-8);

    const response = await kova.goto(`/c/${KOVA_CONTAINER_ID}?q=rope`);
    expect(response?.status()).toBe(200);
    // A real redirect before anything rendered, not a second navigation later.
    expect(response?.request().redirectedFrom()).not.toBeNull();
    // Just the name — no id digits.
    const container = new URL(kova.url());
    expect(container.pathname).toBe("/c/kova");
    expect(container.searchParams.get("q")).toBe("rope");

    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);
    expect(new URL(kova.url()).pathname).toBe("/character/kova");

    // Links from the previous release (name + id digits) and stale names with
    // the right digits still find it, and are corrected.
    await kova.goto(`/c/kova-${suffix}`);
    expect(new URL(kova.url()).pathname).toBe("/c/kova");
    await kova.goto(`/c/some-old-name-${suffix}`);
    expect(new URL(kova.url()).pathname).toBe("/c/kova");
    await kova.context().close();
  });

  test("a signed-out visitor is redirected to sign-in by the server", async ({
    browser,
  }) => {
    const page = await (await browser.newContext()).newPage();
    const response = await page.goto(`/c/${KOVA_CONTAINER_ID}`);
    // Landed on /signin through a real redirect, not after a 200 skeleton.
    expect(response?.request().redirectedFrom()).not.toBeNull();
    expect(new URL(page.url()).pathname).toBe("/signin");
    await page.context().close();
  });

  test("a database has one canonical address", async ({ browser }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto("/db/WEAPON");
    expect(new URL(kova.url()).pathname).toBe("/db/weapon");
    await kova.context().close();
  });
});

test.describe("skills, advancement and abilities", () => {
  test("advancement raises a marked skill by one and spends the mark", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);
    const row = () => kova.locator("li").filter({ hasText: "Bushcraft" }).first();
    // Bushcraft is marked in the seed. Mark it if another test spent it.
    const mark = row().getByRole("checkbox", { name: /advancement mark for bushcraft/i });
    if (!(await mark.isChecked())) await saved(kova, () => mark.check());
    const before = Number(await row().locator("span.font-mono.tabular-nums").innerText());

    await kova.getByRole("button", { name: /^advancement/i }).click();
    const panel = kova.locator("#advancement");
    const entry = panel.locator("li").filter({ hasText: "Bushcraft" });
    await saved(kova, () => entry.getByRole("button", { name: /raised \+1/i }).click());

    await kova.reload();
    await expect(row().locator("span.font-mono.tabular-nums")).toHaveText(String(before + 1));
    await expect(
      row().getByRole("checkbox", { name: /advancement mark for bushcraft/i }),
    ).not.toBeChecked();
    await kova.context().close();
  });

  test("levels are read-only until Edit levels", async ({ browser }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);
    await expect(kova.locator("#skill-level-Swimming")).toHaveCount(0);

    await kova.getByRole("button", { name: /edit levels/i }).click();
    const swimming = kova.locator("#skill-level-Swimming");
    const start = Number(await swimming.inputValue());
    await saved(kova, () => swimming.fill(String(start + 2)));
    await kova.getByRole("button", { name: /^done$/i }).click();

    await kova.reload();
    await expect(
      kova.locator("li").filter({ hasText: "Swimming" }).first().locator("span.font-mono.tabular-nums"),
    ).toHaveText(String(start + 2));
    await kova.context().close();
  });

  test("a heroic ability reads plainly and opens for editing with its pencil", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);
    const name = `Probe ${Date.now().toString().slice(-5)}`;

    await saved(kova, () => kova.getByRole("button", { name: /add ability/i }).click());
    const field = kova.locator('input[id^="ability-name-"]');
    await field.fill(name);
    await saved(kova, () => field.press("Enter"));
    await kova.getByRole("button", { name: /^done$/i }).click();

    await expect(kova.locator('input[id^="ability-name-"]')).toHaveCount(0);
    await expect(kova.getByRole("heading", { name, level: 3 })).toBeVisible();

    await kova.getByRole("button", { name: `Edit ${name}` }).click();
    await saved(kova, () => kova.getByRole("button", { name: /^remove$/i }).click());
    await expect(kova.getByRole("heading", { name, level: 3 })).toHaveCount(0);
    await kova.context().close();
  });

  test("the dice roller is on the sheet", async ({ browser }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);
    await expect(kova.locator("#dice #notation")).toBeVisible();
    await kova.context().close();
  });
});
