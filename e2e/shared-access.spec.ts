import { test, expect, type Browser, type Page } from "@playwright/test";

import { PARTY_WAGON_ID } from "../backend/db/seed-data";

/**
 * Shared containers belong to the players the GM puts in them.
 *
 * Asked for directly: "make the GM be the one putting people on the shared
 * [containers] — they can put players in and take them out as they wish".
 * Before this, a shared container was everyone's and nothing could change
 * that. The test runs the GM's actual controls and checks what each player
 * can then reach — read and write — rather than what the dialog says.
 */
const ACCOUNTS: Record<string, { email: string; password: string }> = {
  Ravna: { email: "ravna@ravenholt.example", password: "brass-lantern-4821" },
  Kova: { email: "kova@ravenholt.example", password: "iron-lantern-9037" },
  // The same password every other spec uses: in the fixture store, whichever
  // test signs a seeded member in first sets it for the rest of the run.
  Milo: { email: "milo@ravenholt.example", password: "clay-lantern-5518" },
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

async function setMembers(gm: Page, choose: "everyone" | string[]) {
  await gm.goto(`/c/${PARTY_WAGON_ID}?dialog=share`);
  const dialog = gm.getByRole("dialog");
  if (choose === "everyone") {
    await dialog.getByRole("radio", { name: /everyone at the table/i }).check();
  } else {
    await dialog.getByRole("radio", { name: /only these players/i }).check();
    for (const name of ["Kova", "Milo"]) {
      const box = dialog.getByRole("checkbox", { name: new RegExp(`^${name} is in`) });
      if (choose.includes(name)) await box.check();
      else await box.uncheck();
    }
  }
  await dialog.getByRole("button", { name: /^save$/i }).click();
  await gm.waitForURL((u) => !u.search.includes("dialog"));
}

const sidebarHas = (page: Page, name: RegExp) =>
  page.getByRole("navigation", { name: "Containers" }).filter({ visible: true }).getByRole("link", { name });

test.describe("shared containers", () => {
  test("the GM puts players in and takes them out", async ({ browser }) => {
    const gm = await signIn(browser, "Ravna");
    const kova = await signIn(browser, "Kova");
    const milo = await signIn(browser, "Milo");

    try {
      // Only Kova.
      await setMembers(gm, ["Kova"]);

      await milo.goto("/c/00000000-0000-4000-8000-000000000202");
      await expect(sidebarHas(milo, /party wagon/i)).toHaveCount(0);
      await milo.goto(`/c/${PARTY_WAGON_ID}`);
      await expect(milo.getByText(/not here|sealed|not yours/i).first()).toBeVisible();

      await kova.goto(`/c/${PARTY_WAGON_ID}`);
      await expect(kova.getByRole("heading", { name: "Party Wagon", level: 1 })).toBeVisible();
      await expect(kova.getByRole("link", { name: /from catalogue/i })).toBeVisible();

      // Milo back in.
      await setMembers(gm, ["Kova", "Milo"]);
      await milo.goto(`/c/${PARTY_WAGON_ID}`);
      await expect(milo.getByRole("heading", { name: "Party Wagon", level: 1 })).toBeVisible();

      // A player sees who is in it but gets no controls to change that.
      await kova.goto(`/c/${PARTY_WAGON_ID}?dialog=share`);
      await expect(kova.getByRole("dialog").getByRole("radio")).toHaveCount(0);
    } finally {
      // Leave the shared fixture store the way the rest of the suite expects.
      await setMembers(gm, "everyone");
      await gm.context().close();
      await kova.context().close();
      await milo.context().close();
    }
  });
});
