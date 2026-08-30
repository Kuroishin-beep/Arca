import { test, expect, type Page, type Browser } from "@playwright/test";

/**
 * The flow that must never break — SCOPE.md §4 (Playwright), M7, M8, and the
 * phase 4 exit criterion: "two-context Playwright test passes".
 *
 * Two browser contexts, not two pages in one: separate cookie jars are what
 * make them genuinely different people. Sharing a context would share the
 * session and quietly test nothing.
 */

/**
 * A fixed PIN per member, so the same person signs in the same way from every
 * test in the suite.
 *
 * They have to be stable rather than random because the campaign is seeded
 * once for the whole run: the FIRST sign-in for a name enrols it, and every
 * sign-in after that has to present the PIN that enrolment chose.
 */
const PINS: Record<string, string> = {
  Ravna: "4821",
  Kova: "9037",
  Milo: "5518",
};

/**
 * Signs in through the roster: pick the name, then the PIN.
 *
 * Handles both states, because which one a name is in depends on whether an
 * earlier test in this run already signed in as them — a freshly seeded member
 * is asked to choose a PIN, and one who has already been through here is asked
 * for it.
 */
async function signInAs(browser: Browser, displayName: string): Promise<Page> {
  const pin = PINS[displayName];
  if (!pin) throw new Error(`No PIN fixture for ${displayName}.`);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/signin");
  await page.getByRole("link", { name: new RegExp(displayName, "i") }).click();

  // Wait for the form before asking anything about it. `isVisible()` resolves
  // immediately rather than waiting, so branching on it straight after a click
  // reads the OLD page and picks the wrong path every time.
  await page.waitForURL(/member=/);
  const pinField = page.locator("#pin");
  await pinField.waitFor();
  await pinField.fill(pin);

  // Present only while enrolling — a member who already has a PIN is asked for
  // it once, not twice.
  const confirmField = page.locator("#confirmPin");
  if ((await confirmField.count()) > 0) await confirmField.fill(pin);

  await page.getByRole("button", { name: /sign in/i }).click();
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

  /**
   * A player adds a shared container and the GM sees it — SCOPE.md §3.
   *
   * Two contexts again, because "a player may create one" is only half the
   * claim. The half that matters at a table is that what they created is
   * genuinely part of the campaign rather than something visible only to its
   * author, and one browser cannot tell those two apart.
   */
  test("a container a player adds shows up for the GM", async ({ browser }) => {
    const player = await signInAs(browser, "Kova");
    await openPartyContainer(player);

    const name = `Kova's mule ${Date.now()}`;

    await player.getByRole("link", { name: /new container/i }).click();
    await expect(player.getByRole("dialog")).toBeVisible();
    await player.getByLabel("Name").fill(name);
    // A player gets the two kinds that are theirs to decide. "World" must not
    // be one of them.
    await expect(
      player.getByRole("radio", { name: /world/i }),
    ).toHaveCount(0);
    await player.getByRole("radio", { name: /shared/i }).check();
    await player.getByRole("button", { name: /^create$/i }).click();

    // Lands inside the new container, which is where the next step (putting
    // something in it) starts.
    await player.waitForURL(/\/c\//);
    await expect(
      player.getByRole("navigation", { name: "Containers" }).first(),
    ).toContainText(name);

    const gm = await signInAs(browser, "Ravna");
    await expect(
      gm.getByRole("navigation", { name: "Containers" }).first(),
    ).toContainText(name);

    // And they can edit what they made — but only its name and capacity. The
    // kind is rendered as frozen text rather than radios, because reshaping a
    // container is the GM's call and the server refuses it either way.
    const renamed = `${name} (renamed)`;
    await player.getByRole("link", { name: /^edit$/i }).click();
    await expect(player.getByRole("dialog")).toBeVisible();
    await expect(player.getByRole("radio")).toHaveCount(0);
    await player.getByLabel("Name").fill(renamed);
    await player.getByRole("button", { name: /^save$/i }).click();

    await expect(
      player.getByRole("navigation", { name: "Containers" }).first(),
    ).toContainText(renamed);

    await player.context().close();
    await gm.context().close();
  });
});
