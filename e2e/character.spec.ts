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
