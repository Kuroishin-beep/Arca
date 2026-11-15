import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Forgot password (ask the GM — Arca sends no mail) and change password.
 * Each test signs up its own account so the seeded ones keep their passwords.
 */

async function signUp(browser: Browser, name: string, email: string, password: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signup");
  await page.locator("#displayName").fill(name);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/c\//);
  return page;
}

async function signIn(page: Page, email: string, password: string, firstTime = false) {
  await page.goto("/signin");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  if (firstTime) {
    await page.getByText(/first time signing in/i).click();
    await page.locator("#confirmPassword").fill(password);
  }
  await page.getByRole("button", { name: /sign in/i }).click();
}

test("forgot password asks the GM, who resets it, and the player picks a new one", async ({
  browser,
}) => {
  const stamp = Date.now().toString().slice(-6);
  const email = `forgetful-${stamp}@elsewhere.example`;
  const player = await signUp(browser, `Pip ${stamp}`, email, "first-lantern-111");
  await player.context().close();

  // Signed out, from the sign-in screen.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/signin");
  await anon.getByRole("link", { name: /forgot your password/i }).click();
  await anon.waitForURL(/\/forgot/);
  await anon.locator("#email").fill(email);
  await anon.getByRole("button", { name: /ask my gm/i }).click();
  await expect(anon.getByText(/your gm will now see a reset request/i)).toBeVisible();

  // The GM sees the request on the roster, and resets.
  const gm = await (await browser.newContext()).newPage();
  await signIn(gm, "ravna@ravenholt.example", "brass-lantern-4821", true);
  await gm.waitForURL(/\/c\//);
  await gm.goto("/members");
  const row = gm.locator("li").filter({ hasText: `Pip ${stamp}` });
  await expect(row.getByText("Asked for a reset")).toBeVisible();
  await row.getByRole("button", { name: /reset password/i }).click();
  await expect(row.getByText("No password yet")).toBeVisible();
  await expect(row.getByText("Asked for a reset")).toHaveCount(0);
  await gm.context().close();

  // The player chooses a new password the first-time way.
  await signIn(anon, email, "second-lantern-222", true);
  await anon.waitForURL(/\/c\//);
  await anon.context().close();
});

test("a signed-in player changes their password, knowing the current one", async ({
  browser,
}) => {
  const stamp = Date.now().toString().slice(-6);
  const email = `changer-${stamp}@elsewhere.example`;
  const page = await signUp(browser, `Wren ${stamp}`, email, "old-lantern-333");

  // Reached from your own name in the top bar.
  await page.getByRole("link", { name: /^account:/i }).click();
  await page.waitForURL(/\/account/);

  await page.locator("#currentPassword").fill("not-my-password");
  await page.locator("#newPassword").fill("new-lantern-444");
  await page.locator("#confirmPassword").fill("new-lantern-444");
  await page.getByRole("button", { name: /change password/i }).click();
  await expect(page.getByText(/not your current password/i)).toBeVisible();

  await page.locator("#currentPassword").fill("old-lantern-333");
  await page.locator("#newPassword").fill("new-lantern-444");
  await page.locator("#confirmPassword").fill("new-lantern-444");
  await page.getByRole("button", { name: /change password/i }).click();
  await expect(page.getByText(/password changed/i)).toBeVisible();

  // The new one works; the old one does not.
  await page.context().clearCookies();
  await signIn(page, email, "old-lantern-333");
  await expect(page.getByText(/email and password do not match/i)).toBeVisible();
  await signIn(page, email, "new-lantern-444");
  await page.waitForURL(/\/c\//);
  await page.context().close();
});
