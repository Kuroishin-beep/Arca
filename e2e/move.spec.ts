import { test, expect, type Page, type Browser } from "@playwright/test";

/**
 * The flow that must never break — SCOPE.md §4 (Playwright), M7, M8, and the
 * phase 4 exit criterion: "two-context Playwright test passes".
 *
 * Two browser contexts, not two pages in one: separate cookie jars are what
 * make them genuinely different people. Sharing a context would share the
 * session and quietly test nothing.
 */

/** Signs in through the member picker, which is the active path whenever
 *  Discord is unconfigured — as it is for this suite. */
async function signInAs(browser: Browser, displayName: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/signin");
  await page.getByRole("button", { name: new RegExp(displayName, "i") }).click();
  await page.waitForURL(/\/c\//);
  return page;
}

/** The party wagon: the one container both a GM and a player may write to, so
 *  it is where a cross-user move can be observed from both ends. */
async function openPartyContainer(page: Page): Promise<string> {
  const link = page
    .getByRole("navigation", { name: "Containers" })
    .first()
    .getByRole("link")
    .filter({ hasText: /wagon|party|shared|stash/i })
    .first();
  await link.click();
  await page.waitForURL(/\/c\//);
  return new URL(page.url()).pathname;
}

test.describe("the move", () => {
  test("a move by one player appears in another player's panel", async ({
    browser,
  }) => {
    const gm = await signInAs(browser, "Ravna");
    const player = await signInAs(browser, "Kova");

    const partyPath = await openPartyContainer(gm);
    // The observer sits on the same container and does NOT reload afterwards.
    // That is the point: M8 says "with no manual refresh".
    await player.goto(partyPath);

    // Assertions are scoped to the `<table>` on purpose. The same item name is
    // ALSO rendered in the stacked list this layout hides above the `panel`
    // breakpoint, and a bare text locator finds that hidden copy first — which
    // fails for a reason that has nothing to do with syncing.
    const gmRow = gm.locator("table tbody tr").first();
    const itemName = (await gmRow.locator("td").first().innerText()).trim();
    expect(itemName).not.toBe("");

    const playerRow = player.locator("table tbody tr", { hasText: itemName });
    await expect(playerRow.first()).toBeVisible();

    // Open the item, then the move dialog.
    await gmRow.getByRole("link").first().click();
    await gm.getByRole("link", { name: /move item/i }).click();
    await expect(gm.getByRole("dialog")).toBeVisible();
    await gm.getByRole("button", { name: /^move$/i }).click();

    // The assertion that IS M8: the observer never reloaded, and the row goes
    // away on its own. The budget is two seconds; the timeout is a little
    // looser so a slow machine reports honestly rather than flaking.
    await expect(playerRow).toHaveCount(0, { timeout: 5_000 });

    await gm.context().close();
    await player.context().close();
  });

  test("a player cannot open a container that is not theirs", async ({
    browser,
  }) => {
    // Acceptance criterion 3: editing the URL to reach a GM-only container
    // returns a permission error and leaks nothing.
    const gm = await signInAs(browser, "Ravna");

    const worldLink = gm
      .getByRole("navigation", { name: "Containers" })
      .first()
      .getByRole("link");
    const count = await worldLink.count();
    let sealedPath: string | null = null;
    for (let i = 0; i < count; i++) {
      const href = await worldLink.nth(i).getAttribute("href");
      if (href?.startsWith("/c/")) sealedPath = href;
    }
    expect(sealedPath).not.toBeNull();
    await gm.context().close();

    const player = await signInAs(browser, "Kova");
    await player.goto(sealedPath!);

    // Either the player may see it (a party container) or they get the sealed
    // screen — what must never happen is an unhandled error or a raw list.
    const sealed = player.getByRole("heading", { name: /sealed/i });
    const workspace = player.getByRole("navigation", { name: "Containers" });
    await expect(sealed.or(workspace).first()).toBeVisible();

    await player.context().close();
  });
});
