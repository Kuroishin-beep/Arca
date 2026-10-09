import { test, expect, type Page, type Browser } from "@playwright/test";

import { KOVA_CONTAINER_ID, PARTY_WAGON_ID } from "../backend/db/seed-data";

/**
 * The table's October bug list, each through a real browser:
 *
 *   - Kin is free text, so a homebrew kin can be typed and survives a reload.
 *   - The character sheet opens inside the app's shell, sidebar and all.
 *   - The catalogue's "Define something" sits above the list, and takes an
 *     eighth of a kilo and an Effect longer than 80 characters.
 *   - Selecting a dialog field's text and letting go outside the card does not
 *     throw the dialog away.
 */

const ACCOUNTS: Record<string, { email: string; password: string }> = {
  Ravna: { email: "ravna@ravenholt.example", password: "brass-lantern-4821" },
  Kova: { email: "kova@ravenholt.example", password: "iron-lantern-9037" },
};

async function signInAs(browser: Browser, displayName: string): Promise<Page> {
  const account = ACCOUNTS[displayName];
  if (!account) throw new Error(`No account fixture for ${displayName}.`);

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto("/signin");
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByText(/first time signing in/i).click();
  await page.locator("#confirmPassword").fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/c\//);
  return page;
}

/** Waits for the sheet's optimistic edit to actually reach the server. */
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

test.describe("the October fixes", () => {
  test("kin is free text, and a homebrew kin survives a reload", async ({ browser }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);

    const kin = kova.locator("#kin");
    await expect(kin).toHaveValue("Elf");

    await kin.fill("Goblin");
    await saved(kova, () => kin.press("Enter"));
    await kova.reload();
    await expect(kova.locator("#kin")).toHaveValue("Goblin");

    // Put the seeded elf back, so the other specs still see their example.
    await kova.locator("#kin").fill("Elf");
    await saved(kova, () => kova.locator("#kin").press("Enter"));
    await kova.context().close();
  });

  test("the character sheet keeps the sidebar", async ({ browser }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto(`/character/${KOVA_CONTAINER_ID}`);

    const sidebar = kova.getByRole("navigation", { name: "Containers" }).first();
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /party wagon/i }).first()).toBeVisible();
    await expect(kova.getByRole("link", { name: /back to inventory/i })).toBeVisible();
    await kova.context().close();
  });

  test("defining an entry: button on top, eighths, and a long effect", async ({ browser }) => {
    const gm = await signInAs(browser, "Ravna");
    await gm.goto("/catalog");

    // Above the list, not under it.
    const define = gm.getByRole("button", { name: /define something/i });
    const firstEntry = gm.locator("main ul li").first();
    const defineBox = await define.boundingBox();
    const entryBox = await firstEntry.boundingBox();
    expect(defineBox && entryBox && defineBox.y < entryBox.y).toBe(true);

    await define.click();
    const form = gm.locator("form").filter({ has: gm.locator("input[name=weight]") });
    const name = `Grappling Hook ${Date.now().toString().slice(-5)}`;
    const effect =
      "Can be used to secure a rope. Can be thrown and secured with an ACROBATICS roll at the GM's discretion.";
    expect(effect.length).toBeGreaterThan(80);

    await form.locator("input[name=name]").fill(name);
    await form.locator("input[name=weight]").fill("0.125");
    await form.locator("input[name=types]").fill("Gear");
    await form.locator("textarea[name='stat:effect']").fill(effect);

    // The browser itself would refuse 0.125 against a step of a half.
    expect(
      await form.locator("input[name=weight]").evaluate((el) => (el as HTMLInputElement).validity.valid),
    ).toBe(true);

    await form.getByRole("button", { name: /add to catalogue/i }).click();
    const row = gm.locator("li").filter({ hasText: name });
    await expect(row).toContainText("0.125 kg");
    await expect(row).toContainText("ACROBATICS roll at the GM");
    await gm.context().close();
  });

  test("selecting a dialog field's text past the card's edge keeps the dialog", async ({
    browser,
  }) => {
    const gm = await signInAs(browser, "Ravna");
    await gm.goto(`/c/${PARTY_WAGON_ID}?dialog=edit-container`);

    const dialog = gm.locator("dialog");
    const field = dialog.locator("#name");
    await expect(field).toBeVisible();

    // Press inside the field, drag out over the backdrop, let go.
    const box = (await field.boundingBox())!;
    await gm.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await gm.mouse.down();
    await gm.mouse.move(box.x - 200, box.y + box.height / 2, { steps: 5 });
    await gm.mouse.move(5, 5, { steps: 5 });
    await gm.mouse.up();

    await expect(field).toBeVisible();
    expect(gm.url()).toContain("dialog=edit-container");

    // A real backdrop click still closes it.
    await gm.mouse.click(5, 5);
    await expect(gm).not.toHaveURL(/dialog=/);
    await gm.context().close();
  });
});
