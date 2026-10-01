import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Several campaigns, through the menu on the campaign name.
 *
 * Asked for: "make it that you can add a new campaign and switch between
 * them, and assign players to them" — and "the dropdown arrow doesn't work".
 * The arrow is now the campaign menu; this walks the whole loop a GM would:
 * start a campaign, seat a player who already has an account, and check that
 * player sees the new table and nothing of the old one leaks into it.
 */
const ACCOUNTS: Record<string, { email: string; password: string }> = {
  Ravna: { email: "ravna@ravenholt.example", password: "brass-lantern-4821" },
  Kova: { email: "kova@ravenholt.example", password: "iron-lantern-9037" },
};

async function signIn(browser: Browser, who: string): Promise<Page> {
  const a = ACCOUNTS[who]!;
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto("/signin");
  await page.locator("#email").fill(a.email);
  await page.locator("#password").fill(a.password);
  await page.getByText(/first time signing in/i).click();
  await page.locator("#confirmPassword").fill(a.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/c\//);
  return page;
}

const menu = (page: Page) =>
  page.getByRole("navigation", { name: "Containers" }).filter({ visible: true });

async function openCampaignMenu(page: Page) {
  await menu(page).locator("summary", { hasText: /./ }).first().click();
}

async function switchTo(page: Page, campaign: string) {
  const target = menu(page).getByRole("button", { name: new RegExp(campaign) });
  // A <details> toggles: only click the summary if the menu is shut.
  if (!(await target.isVisible())) await openCampaignMenu(page);
  await target.click();
  await page.waitForURL(/\/c\//);
}

test.describe("campaigns", () => {
  test("start a campaign, seat a player, and switch between tables", async ({ browser }) => {
    const name = `Misty Vale ${Date.now().toString().slice(-5)}`;
    const gm = await signIn(browser, "Ravna");

    // The arrow opens a real menu.
    await openCampaignMenu(gm);
    await expect(menu(gm).getByText(/your campaigns/i)).toBeVisible();
    await expect(menu(gm).getByRole("button", { name: /ravenholt westmarch/i })).toBeVisible();
    // It closes like a menu: Escape, then a click elsewhere.
    await gm.keyboard.press("Escape");
    await expect(menu(gm).getByText(/your campaigns/i)).toBeHidden();
    await openCampaignMenu(gm);
    await gm.locator("main").click({ position: { x: 400, y: 400 } });
    await expect(menu(gm).getByText(/your campaigns/i)).toBeHidden();
    await openCampaignMenu(gm);
    await menu(gm).getByRole("link", { name: /new campaign/i }).click();

    await gm.waitForURL(/\/campaigns\/new/);
    await gm.getByLabel(/campaign name/i).fill(name);
    await gm.getByRole("button", { name: /start campaign/i }).click();

    // Straight into the new campaign: its name in the sidebar, its stash open,
    // and none of the old campaign's containers.
    await gm.waitForURL(/\/c\//);
    await expect(menu(gm).getByRole("heading", { name })).toBeVisible();
    await expect(menu(gm).getByRole("link", { name: /party stash/i })).toBeVisible();
    await expect(menu(gm).getByRole("link", { name: /party wagon/i })).toHaveCount(0);

    // Seat Kova — she already has an account at the other table.
    await gm.goto("/members");
    await gm.getByLabel(/name/i).first().fill("Kova");
    await gm.getByLabel(/email/i).first().fill(ACCOUNTS.Kova!.email);
    await gm.getByRole("radio", { name: /player/i }).check();
    await gm.getByRole("button", { name: /add member/i }).click();
    await expect(gm.locator("li").filter({ hasText: ACCOUNTS.Kova!.email })).toBeVisible();

    // Kova sees both tables in her menu, with what she is at each.
    const kova = await signIn(browser, "Kova");
    await openCampaignMenu(kova);
    const her = menu(kova);
    await expect(her.getByRole("button", { name: new RegExp(name) })).toContainText("Player");
    await expect(her.getByRole("button", { name: /ravenholt westmarch/i })).toBeVisible();

    await switchTo(kova, name);
    await expect(menu(kova).getByRole("heading", { name })).toBeVisible();
    await expect(menu(kova).getByRole("link", { name: /party stash/i })).toBeVisible();
    await expect(menu(kova).getByRole("link", { name: /party wagon/i })).toHaveCount(0);

    // And back.
    await switchTo(kova, "Ravenholt Westmarch");
    await expect(menu(kova).getByRole("link", { name: /party wagon/i })).toBeVisible();

    // The GM takes her out of the new campaign; it leaves her menu.
    await gm.goto("/members");
    await gm.getByRole("button", { name: /remove kova from this campaign/i }).click();
    await gm.waitForURL(/removed=1/);
    await kova.reload();
    await openCampaignMenu(kova);
    await expect(menu(kova).getByRole("button", { name: new RegExp(name) })).toHaveCount(0);

    await kova.context().close();
    await gm.context().close();
  });
});
