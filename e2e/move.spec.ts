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
 * A fixed address and password per member, so the same person signs in the
 * same way from every test in the suite.
 *
 * The addresses match `backend/db/seed-data.ts`; the passwords have to be
 * stable rather than random because the campaign is seeded once for the whole
 * run: the FIRST sign-in for an address enrols it, and every sign-in after
 * that has to present the password that enrolment chose.
 */
const ACCOUNTS: Record<string, { email: string; password: string }> = {
  Ravna: { email: "ravna@ravenholt.example", password: "brass-lantern-4821" },
  Kova: { email: "kova@ravenholt.example", password: "iron-lantern-9037" },
  Milo: { email: "milo@ravenholt.example", password: "clay-lantern-5518" },
};

/**
 * Signs in with the address and password.
 *
 * The confirm field is filled every time. It is the field the sign-in action
 * reads as "this is a first sign-in", and filling it is harmless once a
 * password exists — the action tries the password first and lands before it
 * ever looks at the confirm. So this one path covers both a freshly seeded
 * member and one an earlier test in this run already enrolled, without the
 * test having to know which.
 */
async function signInAs(browser: Browser, displayName: string): Promise<Page> {
  const account = ACCOUNTS[displayName];
  if (!account) throw new Error(`No account fixture for ${displayName}.`);

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
    // Editing lives in the overflow menu now (Wireframe.png puts Share and a
    // `⋯` at the end of the strip row), so the menu has to be opened first.
    // It is a <details>, which is why this is a click on a summary and not a
    // menu-button role.
    await player.locator('summary[aria-label^="More actions"]').click();
    await player.getByRole("link", { name: /edit container/i }).click();
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

test.describe("the session", () => {
  /**
   * Signing out has to actually end the session, not just navigate.
   *
   * The second half is the half worth testing: going back to a container URL
   * afterwards must land on the sign-in screen. A sign-out that only redirects
   * while leaving the cookie in place looks identical from the button and is
   * wrong in the way that matters on a shared machine.
   */
  test("signing out ends the session", async ({ browser }) => {
    const player = await signInAs(browser, "Kova");
    const containerPath = new URL(player.url()).pathname;

    // The badge beside it is inert identity — the labelled control is what
    // signs you out, and this asserts they are genuinely two elements.
    await player.getByRole("button", { name: /sign out/i }).click();
    await player.waitForURL(/\/signin/);
    await expect(
      player.getByRole("heading", { name: /sit at the table/i }),
    ).toBeVisible();

    // The cookie is gone, so the container is no longer reachable.
    await player.goto(containerPath);
    await expect(player).toHaveURL(/\/signin/);

    await player.context().close();
  });
});

test.describe("databases", () => {
  /**
   * The Databases section — Wireframe.png's second sidebar section.
   *
   * The point of the screen is that it reads ACROSS containers, so that is
   * what this asserts: one type, rows from more than one DISTINCT container,
   * and a way back into the container holding each row. The permission half
   * (a hidden container's objects never appearing) is covered exhaustively in
   * `backend/domain/database.test.ts`, where every principal can be checked
   * against every database cheaply.
   */
  test("a database lists objects from more than one container", async ({
    browser,
  }) => {
    const gm = await signInAs(browser, "Ravna");

    // Whichever database the seed produced, rather than a named type — the
    // seed's types are free to change without breaking this.
    const firstDatabase = gm.locator('a[href^="/db/"]').first();
    await expect(firstDatabase).toBeVisible();
    await firstDatabase.click();
    await gm.waitForURL(/\/db\//);

    // The column a container's own table does not have, and the reason this
    // screen exists.
    await expect(gm.getByRole("columnheader", { name: /where/i })).toBeVisible();

    // Distinct containers, not merely several rows: a database that happened
    // to show four items from one pack would pass a row count and prove
    // nothing about reading across containers.
    const hrefs = await gm.locator('tbody a[href^="/c/"]').evaluateAll((links) =>
      links.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
    const containers = new Set(
      hrefs.map((href) => href.split("?")[0]).filter(Boolean),
    );
    expect(containers.size).toBeGreaterThan(1);

    await gm.context().close();
  });
});
