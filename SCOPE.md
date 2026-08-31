# Arca — Full Scope Document

**Version** 1.0 · **Date** 2026-08-26 · **Branch** `feat/backend-foundation`
**Status** Draft for approval

Companion documents:
[Design system](final-project-planning/Design.md) ·
[Research](docs/research/superhuman-docs-and-capacities.md) ·
[Mockups](mockups/index.html) ·
[Domain model](src/domain/types.ts) ·
[State table](States.md)

---

## 1. Summary

Arca is a GUI database web application that runs as a **TaleSpire Symbiote** — an
embedded browser panel inside the TaleSpire virtual tabletop, driven by
TaleSpire's own JavaScript API — built for one Dragonbane Westmarch campaign.

Its purpose is to give a game master and their players a shared, always-in-view
tool for tracking inventory across multiple containers — character packs, the
party's shared wagon or stash, and world containers such as dungeon chests —
with every change syncing live between everyone at the table.

Under the hood it is an **object-oriented personal knowledge management core**:
items are objects with stable identity and composable types; containers hold
references to objects rather than owning them; views control presentation only.
That model comes from `object_oriented_pkm_core_schema.md` and is what makes the
stretch goals (character sheets, arbitrary future record types) additive rather
than a rewrite.

**The single most important action in the product is moving an item from one
container to another.** Every architectural decision below is justified by how
well it serves that one operation.

---

## 2. Problem statement

At a TTRPG table, item tracking is scattered across paper sheets and private
notes. There is no single source of truth. A GM cannot see what the party is
carrying without stopping play to ask, and answers are unreliable — three
players each believe someone else is carrying the rope.

Concretely, the failures are:

1. **No shared state.** Each player's inventory lives somewhere only they can see.
2. **Transfers are lossy.** "I'll give you the healing potion" requires two people
   to correctly edit two separate documents, and one of them forgets.
3. **The GM is blind.** World loot placed in a chest has no representation until
   a player writes it down, and no one can later prove who took it.
4. **Context switching costs table time.** Alt-tabbing out of TaleSpire to a
   spreadsheet breaks immersion and is the reason the tracking lapses.
5. **Derived numbers are stale.** Encumbrance is recomputed by hand, so it is
   simply wrong most of the time.

**The measure of success is table time.** Arca succeeds if the sentence "hang on,
let me check my sheet" stops being said during a session.

---

## 3. Users and permissions

| Role | Who | Can |
| --- | --- | --- |
| **GM** | one per campaign | See and edit every container and every item. Create and delete world containers. Move any item anywhere. Resolve conflicts. |
| **Player** | 3–6 per campaign | See and edit their own character containers. See and edit party containers. See a world container only once the GM has revealed it. Move items between any container they can see and edit. |

Permission rules, stated as invariants:

- `character` containers have exactly one `ownerId`; only that owner and the GM may write.
- `party` containers have no owner; every member of the campaign may read and write.
- `world` containers have no owner; GM read/write always, player read only when
  `revealed = true`, player write only when the GM has granted access.
- A move is permitted only if the actor may **write to both** the source and the
  destination container. This is checked server-side on every move, never only in the UI.
- No player may read a container they have no grant on. Row-level enforcement,
  not a client-side filter.

Following the `User()` insight from the Superhuman Docs research: permissions
are **one view definition evaluated per viewer**, not two hand-maintained
codepaths. The GM view and the player view are the same query with a different
principal.

---

## 4. Tech stack

| Layer | Choice | Why this, here |
| --- | --- | --- |
| **Framework** | **Next.js 16 (App Router), fullstack** | One deployable for UI and API. Server Components render the inventory table on the server, so the panel paints without shipping the whole dataset as JSON. Server Actions give mutations without hand-writing an API client for every verb. |
| **Language** | **TypeScript**, strict | The domain is already typed with branded ids in `src/domain/types.ts`. `moveItem(itemId, containerId)` is two strings in a row — exactly the argument pair you swap by accident — and branding makes that a compile error. |
| **Database** | **PostgreSQL** (Vercel Postgres / Neon) | The schema doc requires JSONB for user-defined property values, plus real foreign keys and CHECK constraints for the ownership invariants. Row Level Security enforces the permission table above at the database, so a bug in a route handler cannot leak another player's pack. |
| **ORM / query** | **Drizzle ORM** + `drizzle-kit` migrations | SQL-shaped, so the many-to-many containment joins stay legible. Migrations are checked-in SQL files, which matters for a schema that will grow property tables. Types are inferred, so they cannot drift from the columns. |
| **Validation** | **Zod** (already a dependency) | One definition per entity: the TypeScript type is inferred from the schema, so there is no validator maintained separately from the type. Same schemas validate Server Action inputs. |
| **Auth** | **Email + password** (`backend/lib/password.ts`, scrypt) | No OAuth provider and no sign-up: an address works because it is in `campaign_members`, so membership stays a GM decision. The address is the identity — it is what a comment is attributed to and what the top bar shows — and a password chosen on first sign-in is what stops anyone holding the link sitting down as the GM. The roster is no longer rendered to anyone unauthenticated, which the earlier name-picker had to do. The cookie carries a user id only; role is re-read from `campaign_members` per request, so a role change takes effect on the next click. |
| **Realtime** | **Postgres `LISTEN`/`NOTIFY` bridged to SSE**, with **Supabase Realtime as the fallback** | Serverless functions cannot hold a socket, so a Vercel-hosted app needs either a Server-Sent Events route on the Node runtime or a hosted realtime service. SSE is one-directional, which is all Arca needs — writes go through Server Actions, only the fan-out needs a channel. |
| **State (client)** | **TanStack Query** + `useOptimistic` | A move must feel instant. Optimistic update on the client, reconcile against the SSE broadcast, roll back with a toast on rejection. |
| **Styling** | **Tailwind CSS v4** over CSS custom properties | See [Design.md](final-project-planning/Design.md) Step A. Tokens in `:root`, theme in an `@theme` block in `app/globals.css` — v4 is CSS-first and has no `tailwind.config.ts`. No gradients anywhere. |
| **Components** | Hand-built on the Design.md component table; the native **`<dialog>`** element for modals | The mockups are already component-shaped. `<dialog>` supplies focus trapping, `Esc` and the top layer with no dependency at all — Radix is only worth adding if a popover or combobox lands later. |
| **Testing** | **Vitest** (unit, already a dependency) + **Playwright** (E2E) | Vitest for permission rules and derived-value maths. Playwright for the one flow that must never break: two browser contexts, move an item in one, assert it appears in the other. |
| **Hosting** | **Vercel** | Preview deployment per PR, which for a Symbiote means a URL you can paste into TaleSpire and test in the real client before merging. |
| **TaleSpire integration** | TaleSpire Symbiote JS API via a thin `lib/talespire.ts` adapter | The API is wrapped behind one module so nothing else imports it. That keeps the app runnable in a normal browser tab (adapter falls back to no-ops) which is the only sane way to develop it. |

### 4.1 Constraints the stack must respect

- **The panel is narrow.** Layout is authored at ~380px first. See Design.md Step F.
- **The panel is an embedded browser.** Assume no browser extensions, restricted
  storage, and that a hard refresh loses in-memory state. Session must survive a reload.
- **Vercel functions are stateless and short-lived.** No in-process pub/sub, no
  in-memory cache treated as authoritative.
- **The audience is one table.** Peak concurrency is under ten users. Optimise
  for correctness and clarity, not throughput.

### 4.2 Explicitly rejected

| Rejected | Instead | Reason |
| --- | --- | --- |
| WebSockets held in a Vercel function | SSE on the Node runtime | Serverless functions cannot hold a long-lived bidirectional socket |
| Firebase / Firestore | PostgreSQL | The model needs joins, CHECK constraints and RLS; document stores make the containment join the application's problem |
| Prisma | Drizzle | The containment queries are join-heavy and read better as SQL |
| A separate Express API | Next.js Route Handlers + Server Actions | A second deployable for a table of six people is overhead with no payoff |
| Redux / Zustand | Server state via TanStack Query, UI state via `useState` | Almost all state here is server state; a client store would be a second copy to keep in sync |
| A gradient anywhere | Flat surface levels | Explicit project constraint — see Design.md |

---

## 5. Domain model

Adapted from `object_oriented_pkm_core_schema.md`, reconciled with the shipped
`src/domain/types.ts`.

### 5.1 The four rules

1. **Object identity is independent of location.** Moving an item never changes its id.
2. **Containers hold references, not copies.** One Longsword object, however many containers it appears in.
3. **Containment is many-to-many and ordered.** An item can be in Backpack *and* Equipped.
4. **Views own presentation only.** A view never creates, copies or mutates a record.

### 5.2 Entities

| Entity | Purpose |
| --- | --- |
| `Object` | The fundamental persistent record. `id`, `created_at`, `updated_at`, `archived_at`. **No `container_id`** — location is an edge. |
| `ObjectType` | A reusable, composable semantic set (`Weapon`, `Equipment`, `Physical Object`). Objects may hold several. Stores singular and plural nouns for UI grammar (a Capacities idea). |
| `PropertyDefinition` | Schema metadata: name, data type, config. Not a value. |
| `ObjectProperty` | The value of one property for one object, stored as JSONB. |
| `RelationType` / `ObjectRelation` | Arbitrary semantic links: `Longsword —crafted_by→ Blacksmith`. Distinct from containment. |
| `Container` | An Object with container capability. `character` / `party` / `world`. |
| `ContainerObject` | The containment edge. Carries `position` and edge-local `metadata` (e.g. *equipped in main hand*, which belongs to the item-in-this-container, not to the item). |
| `View` | Presentation config over a container: visible properties, layout, sort, group, filter. |
| `Block` | Rich content on an object — the notes body. |
| `Comment` | Threaded discussion on a container, `parentId` nullable for replies. |

### 5.3 Reconciling the two models

`src/domain/types.ts` currently models `Item` with a single `containerId` and a
flat `name / qty / weight / notes` shape. The schema doc models a general object
graph with many-to-many containment.

**Decision: ship the general model, expose the simple one.**

- The database uses the object-graph schema from day one. Retrofitting
  many-to-many containment onto a `container_id` column later means rewriting
  every query that touches an item.
- The service layer exposes an `Item` projection matching today's `types.ts`
  shape, backed by a view that joins `objects` + `object_properties` +
  `container_objects`. UI code keeps the simple shape.
- **MVP restricts containment to one edge per item** — enforced by a partial
  unique index, not by the schema shape. Lifting that restriction later is
  dropping an index, not a migration of the data model.

This is the one place the scope deliberately builds more than the MVP needs, and
it is a considered trade: the extra cost is one join, and the avoided cost is a
full rewrite when character sheets land.

### 5.4 Derived values are never stored

Total carried weight, encumbrance status and total value are computed at read
time from the containment edges — the `FormulaMap` pattern from the research and
rule 9 of the schema doc. There is no `total_weight` column to fall out of date.

---

## 6. Feature scope

### 6.1 MVP — must ship

| # | Feature | Acceptance criteria |
| --- | --- | --- |
| M1 | **Email sign-in and campaign membership** | A member signs in with their address, choosing a password on first sign-in, and lands in their campaign. An address that is not in the campaign is refused with the same message as a wrong password, so the form cannot be used to find out who is at the table. |
| M2 | **Container list (sidebar)** | Containers are grouped My Packs / Party / World. Each row shows icon, name, item count. A player never sees an unrevealed world container in the DOM. |
| M3 | **Item table** | Selecting a container lists its items with name, qty, weight, value, tags. Sorting by any column. Sort state announced via `aria-sort`. |
| M4 | **Add item** | A modal creates an item in the current container. Name required, qty a positive integer, weight non-negative. Validation errors render against the field. |
| M5 | **Edit item** | Same modal, prefilled. Optimistic. |
| M6 | **Delete item** | Soft delete via `archived_at`, with an undo toast for 8 seconds. Nothing is hard-deleted. |
| M7 | **MOVE ITEM — the headline feature** | Move all or part of a stack from one container to another. Partial moves split the stack. Both containers' weight totals update. Rejected if the actor cannot write to both ends. Optimistic with rollback. |
| M8 | **Live sync** | Any change made by one user appears in every other connected user's panel within 2 seconds, with no manual refresh. |
| M9 | **Search and filter** | Free-text search across the current container (matching name and aliases), plus tag filter chips. |
| M10 | **Encumbrance** | Carried vs capacity shown as a flat meter with Dragonbane's half-unit and zero-unit weights honoured. Over capacity is a visible warning state, not a block. |
| M11 | **Permissions enforced server-side** | Every read and write is checked against the principal. Verified by a test that a player's session cannot fetch another player's container by id. |
| M12 | **Comments on a container** | Post and reply. Threaded one level. |
| M13 | **Sync status** | An idle / syncing / error pill is visible on every screen, with the last-synced timestamp on hover. |
| M14 | **Runs as a Symbiote** | Loads and is fully usable inside TaleSpire's docked panel with no horizontal scrolling. |
| M15 | **Empty, loading and error states** | Every list surface has a designed empty state; every async surface has a skeleton; every failure has a retry. |

### 6.2 Stretch — earned, not assumed

Built only once the MVP is in real use at a real session.

| # | Feature | Notes |
| --- | --- | --- |
| S1 | **Character sheets** | Attributes, skills, equipment, spells. This is why the object-graph model exists: a character sheet is an object with a `Character` type and its property set, not a new subsystem. |
| S2 | **diceFinder** | Parse standard dice notation (`2d6+3`, `d20`, `4d6kh3`) and fire it into TaleSpire's built-in roller via the Symbiote API. Includes a roll history panel. |
| S3 | **Item templates / a campaign catalogue** | Reusable object types with default property values, so "Rope, 10m" is not retyped. |
| S4 | **Multiple views per container** | Table / cards / grouped, saved per container per user. `views` and `view_properties` already exist for this. |
| S5 | **Multi-container membership** | Drop the partial unique index; an item can be in Backpack and Equipped simultaneously. |
| S6 | **Audit log** | Who moved what, when. The containment edge already carries timestamps. |
| S7 | **Currency and party ledger** | Split loot, track debts. |

### 6.3 Out of scope

Stated so it is not assumed later:

- Multiple simultaneous campaigns per user
- Combat tracking, initiative, or HP
- Rules automation beyond encumbrance arithmetic
- A public marketplace or sharing between campaigns
- A native mobile app
- Offline-first with conflict-free merge — Arca requires connectivity
- Any game system other than Dragonbane
- Importing from other VTTs

---

## 7. Screens

| # | Screen | Purpose | Mockup |
| --- | --- | --- | --- |
| 1 | **Sign in** | email and password, with first-run enrolment | `mockups/01-signin.html` |
| 2 | **Workspace** | The app. Sidebar + item table + detail panel | `mockups/02-workspace.html` |
| 2b | **Database** | Every object of one type, across every container you may open. Sidebar section from `Wireframe.png` | — |
| 3 | **Move item** | The headline flow as a focused dialog | `mockups/03-move-item.html` |
| 4 | **Item editor** | Add / edit, with validation | `mockups/04-item-editor.html` |
| 5 | **States** | Empty, loading, error, permission-denied, over-encumbered, conflict | `mockups/05-states.html` |
| 6 | **Panel widths** | The same workspace at 375px, 380px panel, and desktop | `mockups/06-panel-widths.html` |
| 7 | **Character sheet** *(stretch)* | Attributes, skills, equipment, spells | `mockups/07-character-sheet.html` |
| 8 | **diceFinder** *(stretch)* | Notation bar, parse preview, roll history | `mockups/08-dicefinder.html` |

Screen map:

```
[Sign in] --"authenticated"--> [Workspace]
                                   |
    +---------------+--------------+--------------+---------------+
    |               |              |              |               |
"select        "select a      "click Move    "click + Add    "click Share"
 container"     database"      on a row"       item"             |
    |               |              |              |               v
    v               v              v              v         [Share dialog]
[Workspace,     [Database]   [Move dialog]  [Item editor]
 container]         |
    |          "click a row"
"click a row"       |
    v               v
[Detail panel]  [Workspace, that row's container]
    |
    +--"stretch: open character"--> [Character sheet]
    +--"stretch: open dice"-------> [diceFinder]
```

Every screen returns to the Workspace; there is no dead end.

---

## 8. Architecture

```
TaleSpire client
└── Symbiote panel (embedded browser)
    └── Next.js app on Vercel
        ├── Server Components ....... initial render of container + item table
        ├── Server Actions .......... createItem / updateItem / moveItem / archiveItem
        ├── Route Handlers
        │   └── GET /api/stream ..... SSE, Node runtime, per-campaign channel
        ├── lib/talespire.ts ........ the ONLY module importing the Symbiote API
        ├── lib/auth.ts ............. Auth.js, session -> principal
        └── lib/db ................. Drizzle + Zod schemas
              └── PostgreSQL (Vercel Postgres)
                  ├── RLS policies keyed on the principal
                  └── NOTIFY 'campaign:<id>' on write -> picked up by /api/stream
```

### 8.1 The move operation, end to end

The one flow worth specifying precisely:

1. Player drags or clicks **Move** on an item row.
2. Dialog opens with containers the player may write to. Containers they cannot
   write to are listed and disabled with a reason, not hidden — hiding them
   produces "where did the wagon go?" bug reports.
3. Player picks a destination and a quantity (defaults to the full stack).
4. Client applies the change optimistically: the row leaves the source list, both
   weight meters recompute.
5. `moveItem` Server Action runs in **one transaction**: authorise both ends,
   split the stack if partial, update the containment edge, bump `updated_at`, `NOTIFY`.
6. Every other connected client receives the SSE event and reconciles.
7. On rejection the client rolls back and shows a toast naming the reason
   ("The Sunken Vault is GM-only").

Concurrency: two players moving the same stack at once is resolved by
`SELECT ... FOR UPDATE` on the containment edge. The loser gets "Someone just
moved that — here's where it is now" rather than a silent overwrite.

---

## 9. Data and content needed before build

- Dragonbane encumbrance rules (capacity formula, half-unit and zero-unit items)
- A seed item list of ~60 common Dragonbane items with weights and values
- The campaign's actual character names and their starting packs
- The party's container list (wagon, stash, mule)
- TaleSpire Symbiote API docs: panel sizing, storage, and the dice-roll entry point
- An Arca logo / wordmark for the top bar

---

## 10. Risks

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | **Realtime on serverless.** SSE through Vercel functions may hit duration limits or drop under the panel's embedded browser. | High | High | Build the realtime layer behind one interface with two implementations (SSE and Supabase Realtime) and swap at config. Prototype this in week 1, before any UI. **This is the single biggest technical unknown.** |
| R2 | **Symbiote API surprises** — sizing, storage, or CSP restrictions inside TaleSpire's browser. | Medium | High | Wrap the API in `lib/talespire.ts` from the first commit. Test in the real client from a Vercel preview URL every week, not at the end. |
| R3 | **Object-graph model over-engineers the MVP** and slows delivery. | Medium | Medium | Ship the general schema but the simple projection. If week 3 is behind, the projection is already the only thing the UI knows about — the graph can be flattened without touching UI code. |
| R4 | **Optimistic move UI diverges** from server truth and users lose trust. | Medium | High | Server event is always authoritative; client reconciles rather than merges. Playwright test with two contexts is a merge gate. |
| R5 | **Scope creep into character sheets** before inventory is solid. | High | Medium | Stretch features are behind a flag and do not enter a sprint until M1–M15 have survived one real session. |
| R6 | **JSONB property values make querying awkward** and filters get slow or wrong. | Low | Medium | GIN index on `object_properties.value`; keep the four hot fields (name, qty, weight, value) as real columns on the projection view. |
| R7 | **Permissions leak** through a query that forgets the principal. | Low | Critical | Postgres RLS is the backstop, so an application-layer omission fails closed. Explicit negative test per role. |

**The one thing least understood: R1.** It is scheduled first for that reason.

---

## 11. Milestones

| Phase | Deliverable | Exit criteria |
| --- | --- | --- |
| **0. Spike** | Realtime prototype + Symbiote hello-world | Two browsers see each other's change through Vercel, inside TaleSpire |
| **1. Foundation** | Schema, migrations, Zod domain, auth, RLS | A player session provably cannot read another player's container |
| **2. Read path** | Sidebar + item table + detail panel, real data | A GM opens the panel and sees the true party inventory |
| **3. Write path** | Add / edit / archive with optimistic UI | Changes persist and survive a reload |
| **4. The move** | Move dialog, partial stacks, both-ends authorisation, live fan-out | Two-context Playwright test passes |
| **5. Polish** | Search, filter, encumbrance, comments, all empty/error states, a11y pass | Keyboard-only run of the move flow; no horizontal scroll at 375px |
| **6. Session trial** | Used live for one real session | The GM does not open a spreadsheet |
| **7. Stretch** | Character sheets, then diceFinder | Only after phase 6 |

---

## 12. Acceptance criteria for "done"

Arca v1 is done when all of the following are true:

1. A GM and three players sign in with their email and password and see the same campaign.
2. A player moves a healing potion from their pack to the party wagon; every
   other panel reflects it within 2 seconds without a refresh.
3. A player attempts to open a GM-only world container by editing the URL and
   receives a permission error, with nothing leaked in the response.
4. Carried weight and encumbrance state are correct for every character and are
   never read from a stored column.
5. The full move flow is completable with the keyboard alone, with visible focus
   at every step.
6. There is no horizontal scrolling at 375px wide.
7. There is no gradient anywhere in the shipped CSS.
8. The app loads and is usable inside a docked TaleSpire Symbiote panel.
9. A real session is played with Arca open and no paper inventory sheets.

---

## 13. Open questions

| # | Question | Needed by | Owner |
| --- | --- | --- | --- |
| Q1 | Exact Dragonbane encumbrance formula and capacity by attribute? | Phase 5 | GM |
| Q2 | Does the Symbiote API expose persistent storage, or must session live in a cookie? | Phase 0 | Dev |
| Q3 | Should a world container be revealed per-container or per-item? | Phase 2 | GM |
| Q4 | Does the GM want an audit log in v1, or is undo enough? | Phase 3 | GM |
| Q5 | One campaign hard-coded, or a campaign switcher from day one? | Phase 1 | GM |
| Q6 | Which TaleSpire dice API entry point does diceFinder target? | Stretch | Dev |

---

## 14. Appendix — mapping the research onto this scope

| Source idea | Where it lands |
| --- | --- |
| Coda `User()` volatile formula | §3 — one view definition evaluated per viewer |
| Coda table vs view | §5 — Container owns membership, View owns presentation |
| Coda `thisRow` column formula | §5.4 — derived values computed per row, never stored |
| Coda `FormulaMap` over lists | §5.4 — weight totals map over containment edges |
| Coda display column | `Item.name` is the display property |
| Capacities "everything is an object" | §5.2 — a Container is an Object |
| Capacities type-level properties | §5.2 — `PropertyDefinition` vs `ObjectProperty` |
| Capacities Query vs Collection | §5.2 — rule-based `views.configuration` vs manual `container_objects.position` |
| Capacities Aliases property | M9 — search matches aliases |
| Capacities dashboard "missing" sections | S-tier: GM's unassigned-loot view |
| Capacities no-folders position | §5.1 rule 3 — containment is many-to-many |
| Schema doc rule 9 (derive, don't duplicate) | §5.4 and acceptance criterion 4 |
| Schema doc rule 10 (domain independent of storage) | §5.3 — projection layer between graph and UI |
