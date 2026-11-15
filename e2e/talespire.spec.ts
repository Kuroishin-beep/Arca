import { test, expect, type Page } from "@playwright/test";

/**
 * Inside TaleSpire, Arca follows the TaleSpire campaign: once a GM links the
 * two, opening the Symbiote in that TaleSpire campaign lands in the Arca one.
 * TaleSpire is stood in for by a fake `TS` that reports a campaign.
 */

async function inTaleSpire(page: Page, campaign: { id: string; name: string }) {
  await page.addInitScript((here) => {
    (window as unknown as { TS: unknown }).TS = {
      campaigns: { whereAmI: () => Promise.resolve(here) },
      dice: { putDiceInTray: () => Promise.resolve("roll") },
    };
  }, campaign);
}

async function signInAsGm(page: Page) {
  await page.goto("/signin");
  await page.locator("#email").fill("ravna@ravenholt.example");
  await page.locator("#password").fill("brass-lantern-4821");
  await page.getByText(/first time signing in/i).click().catch(() => undefined);
  if (await page.locator("#confirmPassword").isVisible()) {
    await page.locator("#confirmPassword").fill("brass-lantern-4821");
  }
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/c\//);
}

test("a GM links the TaleSpire campaign, and Arca then follows it", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const westmarch = { id: `ts-e2e-${Date.now()}`, name: "Westmarch (TaleSpire)" };
  await inTaleSpire(page, westmarch);
  await signInAsGm(page);

  // Unlinked: the GM is offered the link for the campaign they are in.
  const offer = page.getByRole("region", { name: "Link to TaleSpire" });
  await expect(offer).toContainText("Westmarch (TaleSpire)");
  await offer.getByRole("button", { name: /^link$/i }).click();
  await expect(offer).toContainText(/linked/i);

  // Start another Arca campaign — which lands in it…
  await page.goto("/campaigns/new");
  await page.getByLabel(/campaign name/i).fill(`Elsewhere ${Date.now().toString().slice(-5)}`);
  await page.getByRole("button", { name: /start campaign/i }).click();
  await page.waitForURL(/\/c\//);

  // …and because the Symbiote is still open in the linked TaleSpire campaign,
  // Arca switches straight back, on its own.
  const menu = page.getByRole("navigation", { name: "Containers" }).filter({ visible: true });
  await expect(menu.getByRole("heading", { name: "Ravenholt Westmarch" })).toBeVisible({
    timeout: 15_000,
  });
  await page.context().close();
});

test("in a plain browser tab nothing is offered", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signInAsGm(page);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Link to TaleSpire" })).toHaveCount(0);
  await page.context().close();
});
