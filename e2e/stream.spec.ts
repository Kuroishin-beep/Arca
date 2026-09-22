import { test, expect, type Browser, type Page } from "@playwright/test";

import { PARTY_WAGON_ID, SEED_CONTAINERS } from "../backend/db/seed-data";

/**
 * The live-update channel, as a permission surface.
 *
 * One channel carries the whole campaign, and the event says only "these
 * containers changed" — no names, no contents. That was a deliberate design
 * choice, and it is still not enough: a container id is a fact about a place,
 * and a player being told the instant the GM moves something inside an
 * unrevealed container learns that the place exists and that something is
 * happening in it. The stream now filters each event to what the viewer may
 * read, which is checked here because nothing on screen would show it.
 */
const ACCOUNTS: Record<string, { email: string; password: string }> = {
  Ravna: { email: "ravna@ravenholt.example", password: "brass-lantern-4821" },
  Kova: { email: "kova@ravenholt.example", password: "iron-lantern-9037" },
};

const VAULT = SEED_CONTAINERS.find((c) => c.name === "The Sunken Vault")!.id;

async function signIn(browser: Browser, who: string): Promise<Page> {
  const account = ACCOUNTS[who]!;
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signin");
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByText(/first time signing in/i).click();
  await page.locator("#confirmPassword").fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/c\//);
  return page;
}

/** Everything the page's own EventSource receives, captured from the client so
 *  the assertion is about what actually reached the browser. */
async function captureEvents(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const received: string[] = [];
    (window as unknown as { __events: string[] }).__events = received;
    const source = new EventSource("/api/stream");
    source.addEventListener("change", (e) => received.push(e.data));
  });
  // Let the connection establish before the write it is supposed to hear about.
  await page.waitForTimeout(1000);
  return () =>
    page.evaluate(() => (window as unknown as { __events: string[] }).__events);
}

test.describe("the live channel", () => {
  test("a player is never told about a container they cannot open", async ({
    browser,
  }) => {
    const player = await signIn(browser, "Kova");
    await player.goto(`/c/${PARTY_WAGON_ID}`);
    const events = await captureEvents(player);

    // The GM writes inside the unrevealed vault.
    const gm = await signIn(browser, "Ravna");
    await gm.goto(`/c/${VAULT}?dialog=add`);
    await gm.locator("#name").fill("Crown of the Drowned King");
    await gm.locator("#weight").fill("1");
    await gm.getByRole("button", { name: /save item/i }).click();
    await gm.waitForURL((u) => !u.search.includes("dialog"));

    // …and then in a container the player shares, which must still arrive:
    // filtering that silenced the channel would "pass" this test while
    // breaking the feature.
    await gm.goto(`/c/${PARTY_WAGON_ID}?dialog=add`);
    await gm.locator("#name").fill("Spare rope");
    await gm.locator("#weight").fill("1");
    await gm.getByRole("button", { name: /save item/i }).click();
    await gm.waitForURL((u) => !u.search.includes("dialog"));

    await player.waitForTimeout(2500);
    const received = (await events()).join(" ");

    expect(received, "the vault's id must never reach a player").not.toContain(
      VAULT,
    );
    expect(received, "a shared container's change must still arrive").toContain(
      PARTY_WAGON_ID,
    );

    await gm.context().close();
    await player.context().close();
  });
});
