import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * The reference diagram, end to end.
 *
 *   Weapons DB ──► Backpack ◄── Items DB        Backpack: a dagger and a
 *        │                                      sleeping fur → only the columns
 *        └──────► At Hand                       they share (cost, weight).
 *                                               At Hand: only weapons → the
 *                                               weapon columns.
 *
 * Plus the two notes: an item exists once, independently of the containers
 * that reference it; and the item's name is the hyperlink to its complete
 * details.
 */

const RAVNA = { email: "ravna@ravenholt.example", password: "brass-lantern-4821" };

async function signInAsGm(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signin");
  await page.locator("#email").fill(RAVNA.email);
  await page.locator("#password").fill(RAVNA.password);
  await page.locator("#confirmPassword").fill(RAVNA.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/c\//);
  return page;
}

/** A fresh, empty container, so its columns depend only on what this test puts in. */
async function newContainer(page: Page, name: string): Promise<string> {
  await page.getByRole("link", { name: /new container/i }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("radio", { name: /shared/i }).check();
  await page.getByRole("button", { name: /^create$/i }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]+$/);
  return new URL(page.url()).pathname;
}

/** Take one copy of a catalogue entry into the container currently open. */
async function take(page: Page, entryName: string): Promise<void> {
  const here = new URL(page.url()).pathname;
  await page.goto(`${here}?dialog=catalog`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox").fill(entryName);
  await dialog
    .locator("li")
    .filter({ hasText: entryName })
    .first()
    .getByRole("button", { name: /add/i })
    .click();
  await page.waitForURL((url) => url.pathname === here && !url.search.includes("dialog"));
  await expect(page.locator("tbody tr").filter({ hasText: entryName })).toBeVisible();
}

const header = (page: Page, name: RegExp) =>
  page.locator("table:visible thead").getByRole("columnheader", { name });

test.describe("typed databases and adaptive containers", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("At Hand shows weapon columns; a mixed Backpack shows only what they share", async ({
    browser,
  }) => {
    const gm = await signInAsGm(browser);
    const stamp = Date.now().toString().slice(-5);

    await newContainer(gm, `At Hand ${stamp}`);
    await take(gm, "Dagger");
    await expect(header(gm, /grip/i)).toBeVisible();
    await expect(header(gm, /damage|dmg/i)).toBeVisible();
    await expect(header(gm, /durability/i)).toBeVisible();
    const daggerRow = gm.locator("tbody tr").filter({ hasText: "Dagger" });
    await expect(daggerRow).toContainText("1D6");
    await expect(daggerRow).toContainText("Subtle");

    await newContainer(gm, `Backpack ${stamp}`);
    await take(gm, "Dagger");
    await take(gm, "Sleeping Fur");
    // Mixed: the weapon columns go, the shared ones stay.
    await expect(header(gm, /grip/i)).toHaveCount(0);
    await expect(header(gm, /effect/i)).toHaveCount(0);
    await expect(header(gm, /value/i)).toBeVisible();
    await expect(header(gm, /wt|weight/i)).toBeVisible();

    await gm.context().close();
  });

  test("the Weapons database lists the dagger once, with every container holding it", async ({
    browser,
  }) => {
    const gm = await signInAsGm(browser);
    const stamp = Date.now().toString().slice(-5);

    await newContainer(gm, `Left ${stamp}`);
    await take(gm, "Dagger");
    await newContainer(gm, `Right ${stamp}`);
    await take(gm, "Dagger");

    await gm.goto("/db/weapon");
    for (const column of [/grip/i, /str/i, /damage/i, /durability/i, /features/i, /cost/i, /weight/i, /where/i]) {
      await expect(gm.getByRole("columnheader", { name: column })).toBeVisible();
    }

    const rows = gm.locator("tbody tr").filter({
      has: gm.getByRole("link", { name: "Dagger", exact: true }),
    });
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(`Left ${stamp}`);
    await expect(rows).toContainText(`Right ${stamp}`);
    await expect(rows).toContainText("1D6");

    // The name is the hyperlink to the complete details.
    await rows.getByRole("link", { name: "Dagger", exact: true }).click();
    await gm.waitForURL(/\?item=/);
    const details = gm.getByRole("complementary").or(gm.locator("aside")).first();
    await expect(details).toContainText("Durability");
    await expect(details).toContainText("Subtle");

    await gm.context().close();
  });

  test("the GM gives a new catalogue weapon its stats, and a copy shows them", async ({
    browser,
  }) => {
    const gm = await signInAsGm(browser);
    const name = `Spear ${Date.now().toString().slice(-5)}`;

    await gm.goto("/catalog");
    await gm.getByRole("button", { name: /define something/i }).click();
    const form = gm.locator("form").filter({ has: gm.locator("input[name=weight]") });
    await form.locator("input[name=name]").fill(name);
    // Typing the type is what makes the weapon inputs appear.
    await expect(form.locator('input[name="stat:damage"]')).toHaveCount(0);
    await form.locator("input[name=types]").fill("Physical Object, Weapon");
    await form.locator('input[name="stat:grip"]').fill("2H");
    await form.locator('input[name="stat:damage"]').fill("1D10");
    await form.locator('input[name="stat:durability"]').fill("9");
    await form.getByRole("button", { name: /add to catalogue/i }).click();
    await expect(gm.locator("li").filter({ hasText: name }).first()).toContainText("1D10");

    await newContainer(gm, `Rack ${name}`);
    await take(gm, name);
    await expect(gm.locator("tbody tr").filter({ hasText: name })).toContainText("1D10");

    await gm.context().close();
  });
});
