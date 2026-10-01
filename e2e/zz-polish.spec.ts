import { test } from "@playwright/test";
const OUT = "C:/Users/PC/AppData/Local/Temp/claude/E--Github-ARCA1/24706b99-aef9-4f42-8577-91bfbae4fa5b/scratchpad/polish";
test("polish shots", async ({ browser }) => {
  test.setTimeout(240_000);
  for (const width of [1280, 375]) {
    const page = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage();
    await page.goto("/signin");
    await page.screenshot({ path: `${OUT}/${width}-signin.png` });
    await page.goto("/signup");
    await page.screenshot({ path: `${OUT}/${width}-signup.png` });
    await page.goto("/signin");
    await page.locator("#email").fill("ravna@ravenholt.example");
    await page.locator("#password").fill("brass-lantern-4821");
    await page.getByText(/first time signing in/i).click();
    await page.locator("#confirmPassword").fill("brass-lantern-4821");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/c\//);
    for (const [name, url] of [["workspace", "/c/00000000-0000-4000-8000-000000000203"], ["item", "/c/00000000-0000-4000-8000-000000000203?item=" ], ["catalog", "/catalog"], ["members", "/members"], ["character", "/character/00000000-0000-4000-8000-000000000201"], ["db", "/db/gear"], ["dice", "/dice"]] as const) {
      if (name === "item") {
        await page.goto("/c/00000000-0000-4000-8000-000000000203");
        const href = await page.locator('a[href*="item="]').first().getAttribute("href");
        await page.goto(href!);
      } else {
        await page.goto(url);
      }
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${OUT}/${width}-${name}.png` });
    }
    if (width === 375) {
      await page.goto("/c/00000000-0000-4000-8000-000000000203?nav=1");
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${OUT}/375-drawer.png` });
    }
    await page.context().close();
  }
});
