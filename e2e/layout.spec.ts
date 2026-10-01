import { test, expect } from "@playwright/test";

/**
 * The shell's own controls — the parts of the page that are not about any one
 * container, and so are easy to break without any feature test noticing.
 */
const RAVNA = { email: "ravna@ravenholt.example", password: "brass-lantern-4821" };

test.describe("the workspace shell", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /**
   * Reported from the live site: "I closed the sidebar and I can't open it
   * anymore". Collapsing used to remove the sidebar entirely, leaving one 13px
   * glyph as the only way back. It now shrinks to the icon rail, which keeps
   * every container reachable and carries its own "Show the sidebar" button.
   */
  test("a collapsed sidebar leaves navigation behind and can always be reopened", async ({
    page,
  }) => {
    await page.goto("/signin");
    await page.locator("#email").fill(RAVNA.email);
    await page.locator("#password").fill(RAVNA.password);
    await page.getByText(/first time signing in/i).click();
    await page.locator("#confirmPassword").fill(RAVNA.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/c\//);

    await page.getByRole("link", { name: "Hide the sidebar" }).click();
    await page.waitForURL(/rail=0/);

    // Not gone: the icon rail is still there, with every container on it.
    const rail = page.getByRole("navigation", { name: "Containers" }).filter({ visible: true });
    await expect(rail).toHaveCount(1);
    await expect(rail.getByRole("link", { name: /party wagon/i })).toBeVisible();

    // And the way back is on the rail itself, where the sidebar was.
    await rail.getByRole("link", { name: "Show the sidebar" }).click();
    await page.waitForURL((url) => !url.search.includes("rail=0"));
    await expect(page.getByRole("link", { name: "Hide the sidebar" })).toBeVisible();
    await expect(page.getByRole("link", { name: /new container/i }).first()).toBeVisible();
  });

  test("the account controls sit at the right edge of the top bar", async ({ page }) => {
    await page.goto("/signin");
    await page.locator("#email").fill(RAVNA.email);
    await page.locator("#password").fill(RAVNA.password);
    await page.getByText(/first time signing in/i).click();
    await page.locator("#confirmPassword").fill(RAVNA.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/c\//);

    const signOut = await page.getByRole("button", { name: "Sign out" }).boundingBox();
    expect(signOut, "sign-out button is on screen").not.toBeNull();
    // Within 32px of the right edge — it used to trail the search box and stop
    // mid-screen.
    expect(1280 - (signOut!.x + signOut!.width)).toBeLessThan(32);
  });
});
