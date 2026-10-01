import { test, expect, type Browser, type Page, type Request } from "@playwright/test";

import { KOVA_ID, PARTY_WAGON_ID, SEED_CATALOG } from "../backend/db/seed-data";

/**
 * Replay attacks. The GM's real server-action requests are captured from the
 * browser and resent with a player's session and with none — including edited
 * payloads that try to escalate (Kova making herself GM, a catalogue weight of
 * 99). Every check is on the DATA afterwards: an action answers 200 with an
 * error inside, so the status code proves nothing.
 *
 * This is the attacker's view of the permission model. The unit tests prove
 * each `assertCan*`; this proves nothing reachable over HTTP skips them.
 */
const ACCOUNTS: Record<string, { email: string; password: string }> = {
  Ravna: { email: "ravna@ravenholt.example", password: "brass-lantern-4821" },
  Kova: { email: "kova@ravenholt.example", password: "iron-lantern-9037" },
};

async function signIn(browser: Browser, who: string): Promise<Page> {
  const a = ACCOUNTS[who]!;
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signin");
  await page.locator("#email").fill(a.email);
  await page.locator("#password").fill(a.password);
  await page.getByText(/first time signing in/i).click();
  await page.locator("#confirmPassword").fill(a.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/c\//);
  return page;
}

type Captured = { url: string; headers: Record<string, string>; body: string };

function capture(page: Page): Captured[] {
  const out: Captured[] = [];
  page.on("request", (r: Request) => {
    const h = r.headers();
    if (r.method() === "POST" && h["next-action"]) {
      out.push({ url: r.url(), headers: h, body: r.postData() ?? "" });
    }
  });
  return out;
}

async function replay(page: Page | null, c: Captured, edit = (b: string) => b, browser?: Browser) {
  const headers = { ...c.headers };
  delete headers["cookie"];
  delete headers["content-length"];
  const ctx = page ? page.context() : await browser!.newContext();
  const res = await ctx.request.post(c.url, { headers, data: edit(c.body) });
  const status = res.status();
  if (!page) await ctx.close();
  return status;
}

const findings: string[] = [];
const note = (s: string) => {
  findings.push(s);
  console.log("FINDING:", s);
};

test("replaying GM actions as a player or anonymously changes nothing", async ({ browser }) => {
  test.setTimeout(180_000);
  const gm = await signIn(browser, "Ravna");
  const kova = await signIn(browser, "Kova");
  const reqs = capture(gm);
  const last = () => reqs[reqs.length - 1]!;

  // ── createItem (GM-only) ───────────────────────────────────────────────
  const probe = `Replay probe ${Date.now()}`;
  await gm.goto(`/c/${PARTY_WAGON_ID}?dialog=add`);
  await gm.locator("#name").fill(probe);
  await gm.locator("#weight").fill("1");
  await gm.getByRole("button", { name: /save item/i }).click();
  await gm.waitForURL((u) => !u.search.includes("dialog"));
  const createReq = last();
  const count = async () => {
    await gm.goto(`/c/${PARTY_WAGON_ID}?q=${encodeURIComponent(probe)}`);
    return gm.locator("table tbody tr").filter({ hasText: probe }).count();
  };
  const before = await count();
  await replay(kova, createReq);
  await replay(null, createReq, undefined, browser);
  const after = await count();
  if (after !== before) note(`createItem replay added ${after - before} item(s) as player/anon`);

  // ── addMember (GM-only) ────────────────────────────────────────────────
  const addEmail = `replay-${Date.now()}@elsewhere.example`;
  await gm.goto("/members");
  await gm.getByLabel(/name/i).first().fill("Replay");
  await gm.getByLabel(/email/i).first().fill(addEmail);
  await gm.getByRole("radio", { name: /player/i }).check();
  await gm.getByRole("button", { name: /add member/i }).click();
  await expect(gm.locator("li").filter({ hasText: addEmail })).toBeVisible();
  const addReq = [...reqs].reverse().find((r) => r.body.includes(addEmail))!;
  const smuggled = `smuggled-${Date.now()}@elsewhere.example`;
  await replay(kova, addReq, (b) => b.replaceAll(addEmail, smuggled).replace(/player/g, "gm"));
  await replay(null, addReq, (b) => b.replaceAll(addEmail, smuggled), browser);
  await gm.goto("/members");
  if (await gm.locator("li").filter({ hasText: smuggled }).count()) {
    note("addMember replay as player/anon created a member");
  }

  // ── setMemberRole: Kova tries to make herself GM ───────────────────────
  const newRow = gm.locator("li").filter({ hasText: addEmail });
  await newRow.getByRole("button", { name: /make gm/i }).click();
  await gm.waitForURL(/role=1/);
  const roleReq = [...reqs].reverse().find((r) => /userId/.test(r.body) && /gm/.test(r.body))!;
  const newUserId = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(roleReq.body)?.[0];
  if (newUserId) {
    await replay(kova, roleReq, (b) => b.replaceAll(newUserId, KOVA_ID));
    await replay(null, roleReq, (b) => b.replaceAll(newUserId, KOVA_ID), browser);
  }
  await gm.goto("/members");
  const kovaRow = gm.locator("li").filter({ hasText: "kova@ravenholt.example" });
  if (await kovaRow.getByText("GM", { exact: true }).count()) note("Kova promoted herself to GM by replay");

  // ── updateCatalogItem (GM-only): set a weight to 99 ────────────────────
  // The Shortbow, not the Rope: catalog.spec renames the Rope entry, so in a
  // full run it no longer carries its seeded name by the time this runs.
  const rope = SEED_CATALOG.find((e) => e.name === "Shortbow")!;
  await gm.goto("/catalog");
  await gm.locator("li").filter({ hasText: rope.name }).first().getByRole("button", { name: /^edit$/i }).click();
  const form = gm.locator("form").filter({ has: gm.locator("input[name=weight]") });
  await form.locator("input[name=weight]").fill("1");
  await form.getByRole("button", { name: /save entry/i }).click();
  await gm.waitForTimeout(800);
  const catReq = [...reqs].reverse().find((r) => r.body.includes(rope.id))!;
  const toNinetyNine = (b: string) =>
    b.replace(/(name="[^"]*weight"\r\n\r\n)[^\r]*/, "$199");
  await replay(kova, catReq, toNinetyNine);
  await replay(null, catReq, toNinetyNine, browser);
  await gm.goto("/catalog");
  const ropeText = await gm.locator("li").filter({ hasText: rope.name }).first().innerText();
  if (/99\.0 kg/.test(ropeText)) note("catalogue weight changed by player/anon replay");

  console.log(`captured ${reqs.length} action requests; FINDINGS: ${findings.length ? findings.join(" | ") : "none"}`);
  await gm.context().close();
  await kova.context().close();
  expect(findings).toEqual([]);
});
