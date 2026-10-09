# AI usage

How AI was used to build Arca, where it was wrong, and who wrote what.

**Assistant:** Claude (Anthropic), through Claude Code — the desktop app's Code tab,
working directly in this repository. Models: Claude Sonnet 5 (17 September),
Claude Opus 5 (20 September – 1 October), Claude Opus 5.5 (from 25 September).

**How much:** a lot. From 17 September onward Claude wrote almost all of the code
in this repository's commits, under my direction: I said what to build, made the
design decisions, reported what was broken, and chose what to keep. Claude ran the
tests and pushed. The details, with the commit for every claim, are below.

> **How this file was written.** Claude drafted it from the session log and the git
> history at my request (that is itself an AI use, entry 11). I then checked every
> entry against the commits and rewrote section 3 in my own words.
> <!-- TODO (you): delete or edit this note so it says what you actually did. -->

---

## 1. How I used AI

### Entry 1 — Responsive layout and shared components
- **Date / tool:** 2026-09-17 · Claude Code (Claude Sonnet 5)
- **What I asked for:** to follow our `Design.md` and wireframes: a responsive shell,
  one number stepper used everywhere, sign-in and sign-up as tabs, and richer
  database and character screens.
- **What it gave back:** the responsive shell (phone / tablet / desktop), a shared
  `NumberStepper`, combined auth tabs, and restyled database and character screens.
- **What I kept / changed / why:** kept it. Later the stepper turned out too wide for
  two places it was used (see section 2, case 6) and I had it simplified.
- **Commit:** [9bb17b0](https://github.com/Kuroishin-beep/Arca/commit/9bb17b0)

### Entry 2 — Character sheet
- **Date / tool:** 2026-09-20 · Claude Code (Claude Opus 5)
- **What I asked for:** a full Dragonbane character sheet where every stat, button and
  card is editable, and where the character's name is the same on the player side,
  in the database, and on the sheet.
- **What it gave back:** the sheet with derived values (movement, skill values, HP
  maximum from CON), editable in place, saving on blur.
- **What I kept / changed / why:** kept it. I required the single shared name so a
  rename in one place shows everywhere.
- **Commit:** [d747572](https://github.com/Kuroishin-beep/Arca/commit/d747572)

### Entry 3 — The campaign catalogue
- **Date / tool:** 2026-09-20 · Claude Code (Claude Opus 5)
- **What I asked for:** players add items *from* a database the GM controls, like a
  reference, so that when the GM fixes an item it changes everywhere.
- **What it gave back:** a catalogue where the GM defines entries and players take
  *copies* that read their name, weight and value live from the entry.
- **What I kept / changed / why:** kept the model. I then decided item creation from
  scratch should be GM-only (entry 5).
- **Commit:** [d5f28d9](https://github.com/Kuroishin-beep/Arca/commit/d5f28d9)

### Entry 4 — Bug sweep before pushing
- **Date / tool:** 2026-09-21 · Claude Code (Claude Opus 5) + Playwright
- **What I asked for:** test every feature for bugs with Playwright before pushing.
- **What it gave back:** a list of bugs and fixes, the biggest being that anyone
  could sign in as the GM by editing their cookie (section 2, case 1).
- **What I kept / changed / why:** kept all the fixes; the security one was not
  optional.
- **Commit:** [9ea8071](https://github.com/Kuroishin-beep/Arca/commit/9ea8071)

### Entry 5 — Item creation is GM-only
- **Date / tool:** 2026-09-21 · Claude Code (Claude Opus 5)
- **What I asked for:** make creating items from scratch GM-only.
- **What it gave back:** the server-side check in both storage backends, and the
  "Add item" button hidden for players (they get "From catalogue" instead).
- **What I kept / changed / why:** kept it. This was my design decision: the GM owns
  what an item *is*, so weights stay consistent.
- **Commit:** [5b3a1d7](https://github.com/Kuroishin-beep/Arca/commit/5b3a1d7)

### Entry 6 — Typed databases from my diagram
- **Date / tool:** 2026-09-22 · Claude Code (Claude Opus 5)
- **What I asked for:** I gave it a diagram (Weapons DB and Items DB feeding a
  Backpack and an "At Hand" container) and asked it to cross-check what it had built.
- **What it gave back:** type-specific columns (Weapon: Grip, STR, Damage,
  Durability, Features; Gear: Effect), containers that show only the columns all
  their items share, and each database listing an item once.
- **What I kept / changed / why:** kept it. It pointed out where it differed from my
  drawing (column order, keeping weight in "At Hand" for encumbrance); I accepted those.
- **Commit:** [6fd0bf8](https://github.com/Kuroishin-beep/Arca/commit/6fd0bf8)

### Entry 7 — Trying to break it: concurrency
- **Date / tool:** 2026-09-23 · Claude Code (Claude Opus 5) + real Postgres
- **What I asked for:** try to break the app, log the bugs, plan the fixes, fix them.
- **What it gave back:** proof that five simultaneous moves froze the whole app and
  that simultaneous splits duplicated items (section 2, case 5), then fixes with
  regression tests.
- **What I kept / changed / why:** kept the fixes and the tests.
- **Commit:** [15e673b](https://github.com/Kuroishin-beep/Arca/commit/15e673b)

### Entry 8 — GM chooses who is in each shared container
- **Date / tool:** 2026-10-01 · Claude Code (Claude Opus 5.5)
- **What I asked for:** the GM puts players into shared containers and takes them out.
- **What it gave back:** a member list per shared container, edited by the GM from the
  Share dialog, enforced by the server's read/write checks.
- **What I kept / changed / why:** kept it. Existing shared containers stay open to
  everyone until the GM changes them, so nothing broke for current data.
- **Commit:** [2c4757a](https://github.com/Kuroishin-beep/Arca/commit/2c4757a)

### Entry 9 — Multiple campaigns
- **Date / tool:** 2026-10-01 · Claude Code (Claude Opus 5.5)
- **What I asked for:** create campaigns, switch between them, assign players to them
  — and fix the campaign dropdown arrow, which did nothing.
- **What it gave back:** a working campaign menu, a "New campaign" page, per-campaign
  roles, and adding/removing players on the Members page.
- **What I kept / changed / why:** kept it.
- **Commit:** [fa2b37a](https://github.com/Kuroishin-beep/Arca/commit/fa2b37a)

### Entry 10 — Four fixes I reported
- **Date / tool:** 2026-10-01 · Claude Code (Claude Opus 5.5)
- **What I asked for:** pointer cursor on all buttons; the left-panel search bar did
  not work; one simple quantity field on Add item; a container choice on "New database".
- **What it gave back:** all four, each with a browser test.
- **What I kept / changed / why:** kept them.
- **Commit:** [373b71f](https://github.com/Kuroishin-beep/Arca/commit/373b71f)

### Entry 11 — This file
- **Date / tool:** 2026-10-09 · Claude Code (Claude Opus 5.5)
- **What I asked for:** an AI-usage report following the badge brief.
- **What it gave back:** this draft, built from the git history.
- **What I kept / changed / why:** <!-- TODO (you): what you checked and changed. -->
- **Commit:** <!-- TODO (you): link the commit that adds this file. -->

---

## 2. Where the AI got it wrong

### Case 1 — Anyone could sign in as the GM
- **What it gave me:** the session cookie stored only the user's id, unsigned (code
  from an earlier AI session).
- **What was wrong:** the GM's id is in the public seed file, so anyone could set the
  cookie to it and be the GM with no password. Unsafe.
- **What we did instead:** the cookie is now signed with a server-side secret, and a
  forged cookie is treated as signed out.
- **Commit:** [9ea8071](https://github.com/Kuroishin-beep/Arca/commit/9ea8071)

### Case 2 — "Confirm password" on the log-in form
- **What it gave me:** a sign-in form with a "Confirm password" box.
- **What was wrong:** I noticed it while trying to sign in as the GM — confirming a
  password belongs to creating an account, not logging in, and it confused me.
- **What we did instead:** sign-in is email and password; the confirm field (needed
  only for a member's first sign-in) is folded behind "First time signing in?".
- **Commit:** [3be47e5](https://github.com/Kuroishin-beep/Arca/commit/3be47e5)

### Case 3 — A sidebar you could close but never reopen
- **What it gave me:** a "Hide the sidebar" button.
- **What was wrong:** I closed the sidebar on the live site and could not find a way
  back. Hiding it removed all navigation; the only way back was a tiny icon.
- **What we did instead:** collapsing now shrinks the sidebar to a strip of icons with
  a clear button to bring it back. A test checks the round trip.
- **Commit:** [d5f52f3](https://github.com/Kuroishin-beep/Arca/commit/d5f52f3)

### Case 4 — A search bar that did not search, and a dropdown that did not drop
- **What it gave me:** a "Search" row in the left panel and a chevron next to the
  campaign name.
- **What was wrong:** I found that neither worked. The search row was a link that
  jumped to another box without focusing it (and went home on some pages); the
  chevron was decoration.
- **What we did instead:** the left-panel search is a real search across every
  container and the catalogue; the chevron became the campaign menu.
- **Commits:** [373b71f](https://github.com/Kuroishin-beep/Arca/commit/373b71f),
  [fa2b37a](https://github.com/Kuroishin-beep/Arca/commit/fa2b37a)

### Case 5 — Moves that froze the app and duplicated items
- **What it gave me:** the code that moves part of a stack between containers.
- **What was wrong:** it read the quantity *before* locking the row, and used a second
  database connection inside a transaction. Under simultaneous moves this
  duplicated items (14 rations became 25) and could freeze every request.
- **What we did instead:** the quantity is re-read under the lock, and the whole
  transaction uses one connection. Tests run twelve simultaneous moves.
- **Commit:** [15e673b](https://github.com/Kuroishin-beep/Arca/commit/15e673b)

### Case 6 — Smaller ones
- The quantity stepper overflowed its space in two places — fixed in
  [d5f52f3](https://github.com/Kuroishin-beep/Arca/commit/d5f52f3), then replaced
  with one number field in [373b71f](https://github.com/Kuroishin-beep/Arca/commit/373b71f).
- It committed a temporary screenshot script to main by mistake — removed in
  [812b9ae](https://github.com/Kuroishin-beep/Arca/commit/812b9ae).

---

## 3. Who wrote what

### Code I wrote myself

<!--
TODO (you). This part has to be yours: the badge needs at least a fifth of the
project to be code you wrote, and you must be able to explain it.

For each part:
- File:
- Commit:
- What it does, and why it is built that way (your own words):

If you are not sure which code is yours, check `git log -p -- <file>` for commits you
made by hand. If none of the code is yours, the honest fix is to write a meaningful
piece now — for example a route or a query — and document it here.
-->

### The AI-written code I understand best: moving part of a stack

<!-- TODO (you): rewrite this explanation in your own words. -->

- **File:** `backend/db/postgres-repository.ts`, `moveItem`
- **Commit:** [15e673b](https://github.com/Kuroishin-beep/Arca/commit/15e673b)
- **What it does:** moves some or all of a stack (say 2 of 14 rations) from one
  container to another. Moving the whole stack changes one row: which container
  the item is in. Moving part of it splits the stack: the source keeps the
  remainder, and a new item with the same properties appears in the destination.
- **Why it is built that way:** everything happens in one transaction, so a move
  can never half-happen. The first step locks the item's containment row
  (`SELECT … FOR UPDATE`), so two moves of the same stack queue up instead of
  running at the same time. Then it **re-reads the quantity under the lock**:
  the earlier version used a quantity read before the lock, so every queued move
  wrote the same stale arithmetic — which is how 14 rations became 25. Every
  query inside the transaction uses the transaction's own connection (`tx`); the
  earlier version borrowed a second pooled connection, and with a pool of five,
  five simultaneous moves waited forever for a sixth.
- **Why we kept it:** it is correct under concurrency, and
  `backend/db/catalog.postgres.test.ts` proves it: twelve simultaneous moves keep
  the total exactly the same, and finish.
