import { test, expect, type Page, type Browser } from "@playwright/test";

import {
  KOVA_CONTAINER_ID,
  PARTY_WAGON_ID,
  SEED_CATALOG,
} from "../backend/db/seed-data";

/**
 * The catalogue, end to end — SCOPE.md S3.
 *
 * The contract tests prove the repository keeps its promises. What they cannot
 * prove is that the SCREENS do: that the GM's correction reaches a copy the
 * player is looking at, that a split stack arrives with its name, that a copy's
 * inherited fields are read-only where a player would try to change them.
 * Every test below crosses the form → Server Action → storage → re-render
 * seam, which is exactly where the first version of this feature broke on
 * Postgres while passing everything that ran on fixtures.
 */

const ACCOUNTS: Record<string, { email: string; password: string }> = {
  Ravna: { email: "ravna@ravenholt.example", password: "brass-lantern-4821" },
  Kova: { email: "kova@ravenholt.example", password: "iron-lantern-9037" },
};

const ROPE = SEED_CATALOG[0]!;
const TORCH = SEED_CATALOG[1]!;

async function signInAs(browser: Browser, name: string): Promise<Page> {
  const account = ACCOUNTS[name];
  if (!account) throw new Error(`No account fixture for ${name}.`);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/signin");
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.locator("#confirmPassword").fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/c\//);
  return page;
}

/** Wait for the Server Action behind an edit to land, so a following reload
 *  cannot race it — see `saved` in character.spec.ts for why. */
async function saved(page: Page, act: () => Promise<unknown>): Promise<void> {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    act(),
  ]);
}

/** Take a copy of one entry into a container, through the picker dialog. */
async function takeCopy(
  page: Page,
  containerId: string,
  entryName: string,
): Promise<void> {
  await page.goto(`/c/${containerId}`);
  await page.getByRole("link", { name: /from catalogue/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const row = page.getByRole("dialog").locator("li").filter({ hasText: entryName });
  await saved(page, () => row.getByRole("button", { name: /^add$/i }).click());
  await page.waitForURL((url) => !url.search.includes("dialog="));
}

/** The table row for an item, scoped to the real <table>: the stacked list
 *  below `panel` renders the same names hidden, and would match first. */
function row(page: Page, name: string) {
  return page.locator("table tbody tr").filter({ hasText: name }).first();
}

test.describe("the catalogue", () => {
  test("anyone can browse it; only the GM sees its controls", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    await kova.goto("/catalog");
    await expect(kova.getByRole("heading", { name: /the catalogue/i })).toBeVisible();
    await expect(kova.getByText(ROPE.name).first()).toBeVisible();
    await expect(kova.getByRole("button", { name: /define something/i })).toHaveCount(0);
    await expect(kova.getByRole("button", { name: /^edit$/i })).toHaveCount(0);
    await kova.context().close();

    const gm = await signInAs(browser, "Ravna");
    await gm.goto("/catalog");
    await expect(gm.getByRole("button", { name: /define something/i })).toBeVisible();
    await gm.context().close();
  });

  test("a player takes a copy, and it arrives with the entry's values", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    await takeCopy(kova, KOVA_CONTAINER_ID, TORCH.name);

    const copy = row(kova, TORCH.name);
    await expect(copy).toBeVisible();
    await expect(copy).toContainText(TORCH.value);
    await kova.context().close();
  });

  /**
   * The feature. The GM corrects an entry once; a copy in a player's pack,
   * which the GM never touched, reads the correction.
   */
  test("one correction by the GM reaches a copy in a player's pack", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    await takeCopy(kova, KOVA_CONTAINER_ID, ROPE.name);
    await kova.context().close();

    const renamed = `Rope, hempen (${Date.now().toString().slice(-4)} m)`;

    const gm = await signInAs(browser, "Ravna");
    await gm.goto("/catalog");
    const entry = gm.locator("li").filter({ hasText: ROPE.name }).first();
    await entry.getByRole("button", { name: /^edit$/i }).click();

    const form = gm.locator("form").filter({ has: gm.locator("input[name=weight]") });
    // The form states how many copies the save will change, BEFORE it does.
    await expect(form).toContainText(/in play/i);
    await form.locator("input[name=name]").fill(renamed);
    // A legal Dragonbane weight — the field steps in halves.
    await form.locator("input[name=weight]").fill("0.5");
    await saved(gm, () => form.getByRole("button", { name: /save entry/i }).click());
    await gm.context().close();

    const again = await signInAs(browser, "Kova");
    await again.goto(`/c/${KOVA_CONTAINER_ID}`);
    const copy = row(again, renamed);
    await expect(copy).toBeVisible();
    await expect(copy).toContainText("0.5");
    await again.context().close();
  });

  /**
   * The corruption this suite was written to catch. Splitting a stack of a
   * copy clones the moving half; the clone must keep the link, or it arrives
   * as "Unnamed" and weighs nothing.
   */
  test("a split stack of a copy arrives with its name", async ({ browser }) => {
    const gm = await signInAs(browser, "Ravna");

    // Three torches into the wagon.
    await gm.goto(`/c/${PARTY_WAGON_ID}`);
    await gm.getByRole("link", { name: /from catalogue/i }).click();
    const torchRow = gm.getByRole("dialog").locator("li").filter({ hasText: TORCH.name });
    await torchRow.getByRole("button", { name: /increase quantity/i }).click();
    await torchRow.getByRole("button", { name: /increase quantity/i }).click();
    await saved(gm, () => torchRow.getByRole("button", { name: /^add$/i }).click());
    await gm.waitForURL((url) => !url.search.includes("dialog="));

    // Move ONE of the three to Kova — a split, not a whole-stack move. The
    // dialog opens on the WHOLE stack (moving everything is the common case at
    // a table), so the quantity has to come down explicitly or this quietly
    // tests a whole-stack move instead.
    await row(gm, TORCH.name).getByRole("link").first().click();
    await gm.getByRole("link", { name: /move item/i }).click();
    const dialog = gm.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("#move-qty").fill("1");
    await expect(dialog.locator("#move-qty")).toHaveValue("1");
    await dialog.getByRole("radio", { name: /kova/i }).check();
    await saved(gm, () => dialog.getByRole("button", { name: /^move$/i }).click());

    await gm.goto(`/c/${KOVA_CONTAINER_ID}`);
    const arrived = row(gm, TORCH.name);
    await expect(arrived).toBeVisible();
    await expect(gm.locator("table tbody")).not.toContainText("Unnamed");

    await gm.goto(`/c/${PARTY_WAGON_ID}`);
    await expect(row(gm, TORCH.name)).toContainText("2");
    await gm.context().close();
  });

  test("a copy's inherited fields are read-only; its notes are not", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    await takeCopy(kova, KOVA_CONTAINER_ID, TORCH.name);

    await row(kova, TORCH.name).getByRole("link").first().click();
    await kova.getByRole("link", { name: /^edit$/i }).click();
    const dialog = kova.getByRole("dialog");
    await expect(dialog).toContainText(/copy from the catalogue/i);

    await expect(dialog.locator("#name")).toHaveAttribute("readonly", "");
    await expect(dialog.locator("#weight")).toHaveAttribute("readonly", "");
    await expect(dialog.locator("#notes")).not.toHaveAttribute("readonly", "");

    // Saving a note on a copy must succeed — the round-tripped name and
    // weight are unchanged, so the server must not refuse them.
    await dialog.locator("#notes").fill("Singed. Still lights.");
    await saved(kova, () =>
      dialog.getByRole("button", { name: /save/i }).click(),
    );
    await expect(kova.getByRole("dialog")).toHaveCount(0);
    await kova.context().close();
  });

  test("retiring an entry with copies in play is refused, with the count", async ({
    browser,
  }) => {
    const kova = await signInAs(browser, "Kova");
    await takeCopy(kova, KOVA_CONTAINER_ID, TORCH.name);
    await kova.context().close();

    const gm = await signInAs(browser, "Ravna");
    await gm.goto("/catalog");
    const entry = gm.locator("li").filter({ hasText: TORCH.name }).first();
    await entry.getByRole("button", { name: /retire/i }).click();
    await saved(gm, () => entry.getByRole("button", { name: /confirm/i }).click());

    await expect(gm.getByText(/still exists?\./i)).toBeVisible();
    // Still listed: the refusal left it where it was.
    await expect(gm.locator("li").filter({ hasText: TORCH.name }).first()).toBeVisible();
    await gm.context().close();
  });

  test("the GM defines a new entry and it is immediately takeable", async ({
    browser,
  }) => {
    const name = `Lantern ${Date.now().toString().slice(-5)}`;

    const gm = await signInAs(browser, "Ravna");
    await gm.goto("/catalog");
    await gm.getByRole("button", { name: /define something/i }).click();

    const form = gm.locator("form").filter({ has: gm.locator("input[name=weight]") });
    await form.locator("input[name=name]").fill(name);
    await form.locator("input[name=weight]").fill("1");
    await form.locator("input[name=value]").fill("5 gp");
    await saved(gm, () => form.getByRole("button", { name: /add to catalogue/i }).click());
    await expect(gm.locator("li").filter({ hasText: name }).first()).toBeVisible();

    await takeCopy(gm, PARTY_WAGON_ID, name);
    await expect(row(gm, name)).toContainText("5 gp");
    await gm.context().close();
  });
  test("only the GM can type an item in from scratch", async ({ browser }) => {
    const player = await signInAs(browser, "Kova");
    await player.goto(`/c/${KOVA_CONTAINER_ID}`);
    await expect(player.getByRole("link", { name: /from catalogue/i }).first()).toBeVisible();
    await expect(player.getByRole("link", { name: /^add item$/i })).toHaveCount(0);
    // The URL is not a way round it: the dialog does not open for a player.
    await player.goto(`/c/${KOVA_CONTAINER_ID}?dialog=add`);
    await expect(player.getByRole("dialog")).toHaveCount(0);
    await player.context().close();

    const gm = await signInAs(browser, "Ravna");
    await gm.goto(`/c/${PARTY_WAGON_ID}`);
    await gm.getByRole("link", { name: /^add item$/i }).first().click();
    await expect(gm.getByRole("dialog", { name: /add item/i })).toBeVisible();
    await gm.context().close();
  });
});
