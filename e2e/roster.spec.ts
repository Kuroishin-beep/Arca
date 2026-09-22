import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * The roster — making someone a GM.
 *
 * Adding a member already took a role, but that door only opens for someone
 * who is not at the table yet; an existing player could only be promoted by
 * running a script with database credentials. This is that, from the screen
 * the GM is already on.
 *
 * The test adds its own member rather than promoting a seeded one: the
 * fixture store is shared by the whole suite, and a test that leaves a second
 * GM behind changes what every later test is looking at.
 */
const RAVNA = { email: "ravna@ravenholt.example", password: "brass-lantern-4821" };

async function signIn(
  browser: Browser,
  email: string,
  password: string,
  firstTime = false,
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signin");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  if (firstTime) {
    await page.getByText(/first time signing in/i).click();
    await page.locator("#confirmPassword").fill(password);
  }
  await page.getByRole("button", { name: /sign in/i }).click();
  return page;
}

test.describe("the roster", () => {
  test("the GM promotes a player, and they can then reach the roster", async ({
    browser,
  }) => {
    const gm = await signIn(browser, RAVNA.email, RAVNA.password, true);
    await gm.waitForURL(/\/c\//);

    const email = `deputy-${Date.now()}@elsewhere.example`;
    await gm.goto("/members");
    await gm.getByLabel(/name/i).first().fill("Deputy");
    await gm.getByLabel(/email/i).first().fill(email);
    await gm.getByRole("radio", { name: /player/i }).check();
    await gm.getByRole("button", { name: /add member/i }).click();

    const row = gm.locator("li").filter({ hasText: email });
    await expect(row).toContainText("Player");

    // The new member signs in (choosing a password) and must NOT see the
    // roster — this is the "before" the promotion is measured against.
    const deputyPassword = "cellar-door-4821";
    const deputy = await signIn(browser, email, deputyPassword, true);
    await deputy.waitForURL(/\/c\//);
    await deputy.goto("/members");
    await expect(deputy.getByRole("heading", { name: /not here/i })).toBeVisible();

    await row.getByRole("button", { name: /make gm/i }).click();
    // Waited for, and asserted on the ROLE CHIP rather than on the row's text:
    // the row contains the string "GM" either way, because the button that
    // does the promoting is labelled "Make GM". A weaker assertion here passes
    // while nothing happens.
    await gm.waitForURL(/role=1/);
    await expect(
      gm.locator("li").filter({ hasText: email }).getByText("GM", { exact: true }),
    ).toBeVisible();

    // Same person, same session: the role is read from the roster on every
    // request, so it takes effect on their next click rather than on a new
    // sign-in.
    await deputy.reload();
    await expect(
      deputy.getByRole("heading", { name: /who is at this table/i }),
    ).toBeVisible();
    await expect(
      deputy.getByRole("button", { name: /add member/i }),
    ).toBeVisible();

    // Put the table back the way it was found.
    await gm.reload();
    await gm
      .locator("li")
      .filter({ hasText: email })
      .getByRole("button", { name: /make player/i })
      .click();
    await gm.waitForURL(/role=1/);
    await expect(
      gm
        .locator("li")
        .filter({ hasText: email })
        .getByText("Player", { exact: true }),
    ).toBeVisible();

    await deputy.context().close();
    await gm.context().close();
  });

  test("a GM cannot change their own role", async ({ browser }) => {
    const gm = await signIn(browser, RAVNA.email, RAVNA.password, true);
    await gm.waitForURL(/\/c\//);
    await gm.goto("/members");

    const own = gm.locator("li").filter({ hasText: RAVNA.email });
    await expect(own).toContainText("GM");
    await expect(own.getByRole("button", { name: /make player/i })).toHaveCount(0);

    await gm.context().close();
  });

  test("signing in is email and password; the confirm field is folded away", async ({
    browser,
  }) => {
    const page = await (await browser.newContext()).newPage();
    await page.goto("/signin");

    // Present in the document — hiding it entirely for members with a password
    // would make the form an oracle for who has an account — but not part of
    // the form someone signing in normally has to read.
    await expect(page.locator("#confirmPassword")).toBeHidden();
    await page.getByText(/first time signing in/i).click();
    await expect(page.locator("#confirmPassword")).toBeVisible();

    // And an ordinary sign-in works without ever opening it.
    await page.goto("/signin");
    await page.locator("#email").fill(RAVNA.email);
    await page.locator("#password").fill(RAVNA.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/c\//);

    await page.context().close();
  });
});
