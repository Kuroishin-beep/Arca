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
  test("everything clickable shows the pointer cursor", async ({ page }) => {
    await page.goto("/signin");
    await page.locator("#email").fill(RAVNA.email);
    await page.locator("#password").fill(RAVNA.password);
    await page.getByText(/first time signing in/i).click();
    await page.locator("#confirmPassword").fill(RAVNA.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/c\//);

    // Buttons, the menu summaries, and links all say "click me".
    for (const target of [
      page.getByRole("button", { name: "Sign out" }),
      page.getByRole("button", { name: /theme|dark|light/i }).first(),
      page.getByRole("navigation", { name: "Containers" }).filter({ visible: true }).locator("summary").first(),
    ]) {
      const cursor = await target.evaluate((el) => getComputedStyle(el).cursor);
      expect(cursor).toBe("pointer");
    }
  });

  /**
   * Reported: "search bar on the left panel is not working". It was a link
   * that jumped to the top bar's box without focusing it. It is a real search
   * now — across every container and the catalogue.
   */
  test("the sidebar search finds things everywhere, with where they are", async ({ page }) => {
    await page.goto("/signin");
    await page.locator("#email").fill(RAVNA.email);
    await page.locator("#password").fill(RAVNA.password);
    await page.getByText(/first time signing in/i).click();
    await page.locator("#confirmPassword").fill(RAVNA.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/c\//);

    const box = page.getByRole("searchbox", { name: /search everything/i }).filter({ visible: true });
    await box.fill("longbow");
    await box.press("Enter");
    await page.waitForURL(/\/search\?q=longbow/);

    await expect(page.getByRole("heading", { name: /results for “longbow”/i })).toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: "Longbow" });
    await expect(row.first()).toBeVisible();
    // Where it is — Kova's pack, in a different container from the one we
    // were looking at when we searched.
    await expect(row.first()).toContainText("Kova");
  });

  test("Add item: one quantity field, and a choice of container", async ({ page }) => {
    await page.goto("/signin");
    await page.locator("#email").fill(RAVNA.email);
    await page.locator("#password").fill(RAVNA.password);
    await page.getByText(/first time signing in/i).click();
    await page.locator("#confirmPassword").fill(RAVNA.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/c\//);

    const name = `Grapnel ${Date.now().toString().slice(-5)}`;
    await page.goto("/c/00000000-0000-4000-8000-000000000203?dialog=add");
    const dialog = page.getByRole("dialog");

    // A single number field — no − / + stepper.
    await expect(dialog.getByRole("button", { name: /increase quantity|decrease quantity/i })).toHaveCount(0);
    await dialog.locator("#qty").fill("3");

    // Opened on the Party Wagon, but it goes to Kova's pack.
    await dialog.getByLabel("Container").selectOption({ label: "Kova" });
    await dialog.locator("#name").fill(name);
    await dialog.locator("#weight").fill("1");
    await dialog.getByRole("button", { name: /save item/i }).click();

    await page.waitForURL(/\/c\/00000000-0000-4000-8000-000000000201/);
    await expect(page.locator("table tbody tr").filter({ hasText: name })).toContainText("3");
  });
});
