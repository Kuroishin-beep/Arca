# Wireframes & Component Breakdown — Arca

The filled-in version of [02-wireframes.md](02-wireframes.md). The sketches
themselves are `Wireframe.png`; this document is what they mean, screen by
screen, and which component each box became.

The data model those screens sit on is `Schema.png`, recorded in
[§5](#5-the-schema-the-screens-sit-on) below and implemented in
[`backend/db/schema.ts`](../backend/db/schema.ts).

> Rendered mockups of every screen live in [`mockups/`](../mockups/), and the
> colours and type they use are decided in [Design.md](Design.md). Boxes here,
> colours there — that is the order the worksheet asks for and the order these
> were actually done in.

---

## Step A: Screen map

```
[Sign in] --"email + password"--> [Workspace, a container]
                                        |
     +--------------------+-------------+-------------+------------------+
     |                    |             |             |                  |
"pick a container"  "pick a database"  "click a row"  "Move on a row"   "+ Add item"
     |                    |             |             |                  |
     v                    v             v             v                  v
[Workspace]          [Database]   [Detail panel]  [Move dialog]     [Item editor]
     |                    |
"Share"              "click a row"
     |                    |
     v                    v
[Share dialog]       [Workspace, that row's container]
```

Answering the three questions the worksheet asks:

- **First screen.** `/signin`. Every other route redirects here without a
  session cookie.
- **Home base.** The Workspace. The sidebar is on every inside-the-app screen,
  so the container list is always one click away — which is what makes it the
  nav rather than a screen.
- **Any screen with no way back?** No. The Database screen is the one that could
  have been: it is reached from the sidebar and its rows point at containers,
  so both the way in and the way out are links. Dialogs all carry a `closeHref`
  to the screen underneath.

Two routes are stretch and not in the map above: `/character/[containerId]` and
`/dice`. Both return to the Workspace.

---

## Step B: One box-sketch per screen

Frame by frame from `Wireframe.png`, plus what happens at phone width. The
breakpoints are Tailwind's `lg` (1024px) for the pinned sidebar and a custom
`panel` for TaleSpire's docked panel.

### 1. Sign in

| | |
| --- | --- |
| **Desktop** | Centred card, max 24rem: mark, title, email field, password field, confirm field, submit. Theme toggle pinned top-right. |
| **Phone** | Identical. The card is already one column and already narrower than a phone. |
| **Navigates to** | The Workspace, landing on the party container. |

The wireframe does not draw this screen — it starts inside the app — so its
shape comes from the flow rather than from a sketch. One decision worth
recording: **the roster is not on it.** An earlier version listed every member's
name to anyone holding the link, because the PIN step needed to know which
member it was asking about. Email sign-in removes the need, and the list goes
with it.

The confirm field is always rendered and labelled *only the first time*. Showing
it conditionally would mean the page had to say whether an address is already
enrolled, which turns the form into a way to ask who is at this table.

### 2. Workspace — `Wireframe.png` frame 1

```
┌──────────────────────────────────────────────────────────────────┐
│ TopBar   ☰  Arca   [search…]        sync  ☀  user@mail  ⇥        │
├───────────────┬──────────────────────────────────────────────────┤
│ ◇ Campaign ⌄  │ ▣  [quick access chips…] +      Share  👁  ⋯     │  ← strip row
│ 🔍 Search     ├──────────────────────────────────────────────────┤
│               │ ● Party Wagon  [party]  [read only]   [+ Add]    │
│ CONTAINERS    │ [tag] [tag] [tag]                                │
│  My Packs     ├──────────────────────────────────────────────────┤
│   ▸ Kova's    │ Name        Qty   Weight   Value          ⋯      │
│  Party        │ ─────────────────────────────────────────────    │
│   ▸ Wagon     │ Rope         1     2.0     4 sp                  │
│  World        │ Torch        6     0.5     1 sp                  │
│   ▸ Chest 🔒  │                                                  │
│  + New        │                                                  │
│               │                                                  │
│ DATABASES     │                                                  │
│  ▤ Weapon  4  │                                                  │
│  ▤ Potion  2  ├──────────────────────────────────────────────────┤
│  + New        │ ▰▰▰▱▱  8.5 / 12                                  │
└───────────────┴──────────────────────────────────────────────────┘
```

| | |
| --- | --- |
| **Desktop** | Three columns: sidebar (`--sidebar-w`), main, detail panel (`--detail-w`) when a row is selected. |
| **Phone** | One column. Sidebar becomes a drawer behind ☰; the detail panel becomes a full-height sheet; the strip row keeps the quick-access chips and drops the collapse toggle (there is no pinned rail to collapse). |
| **Navigates to** | Any container, any database, the detail panel, and all four dialogs. |

Three things in the sketch that were not in the app before it:

- **The two sidebar sections.** Containers and Databases. A container is a
  *place*, a database is a *kind*, and the same longsword is in exactly one
  place and in as many kinds as it is.
- **Quick Access**, the chip strip with a `+`. Pinned by hand, not recent — the
  value of the strip is that the wagon is in the same spot every session.
- **Collapse**, the ▣ at the strip row's left, and **Share / ⋯** at its right.

### 3. Database — the same frame, different content

| | |
| --- | --- |
| **Desktop** | Sidebar plus one table: Name, Qty, Weight, **Where**. No detail panel. |
| **Phone** | Sidebar drawers away; the table scrolls horizontally inside its own container rather than making the page scroll. |
| **Navigates to** | The container holding any row, with that row already selected. |

**Where** is the column a container's own table does not need and this one
cannot do without — a database is read as *what do we have, and where is it*.

Read-only on purpose. Write rules are per-container, so an editable cell here
would have to answer "may I write to the container this row happens to be in?"
per row and do nothing on the rows where the answer is no.

### 4. Detail panel — `Wireframe.png` frame 2

| | |
| --- | --- |
| **Desktop** | Docked right, `--detail-w`, scrolling independently of the table. |
| **Phone** | Full-height sheet over the table, with a scrim. |
| **Navigates to** | Move dialog, item editor, and back to the table. |

The wireframe draws this as a document — a title, body blocks, and two embedded
Views. Arca ships the field list and the comment thread; **blocks and embedded
views are wireframed and not built.** The `blocks` table exists and nothing
writes to it yet.

### 5. Comments panel — `Wireframe.png` frame 3

Sketched with a ✕, **Open / Resolved** filter chips, and cards carrying an
avatar, an address, a timestamp, a resolve control and a threaded reply.

**Deferred, on the wireframe's own instruction** — the red sticky beside frame 3
reads *"Hold off on the comments. Not a priority."* What ships today is the
thread inside the detail panel: same cards, same one-level threading, same
attribution to `user@mail.com`, but no panel of its own, no Open/Resolved
filter and no resolve. Resolving needs a `comments.resolved_at` column that has
deliberately not been added.

### 6. Dialogs — move, item editor, container editor, share

| | |
| --- | --- |
| **Desktop** | Centred card in the native `<dialog>` top layer. |
| **Phone** | Bottom sheet, 44px targets, same markup and one breakpoint. |
| **Navigates to** | Back to whatever `closeHref` names. |

Every one of them is a URL (`?dialog=…`), so a half-finished move survives the
reload TaleSpire's embedded browser does constantly.

---

## Step C: Component tree

Taking the Workspace — the busiest screen — and boxing every repeated or
self-contained piece. The blue sticky on `Wireframe.png` lists nine components;
each is matched to what was built.

| Sticky note asks for | Built as | Level |
| --- | --- | --- |
| buttons | `Button`, `ButtonLink`, `IconButton`, `IconButtonLink` | atom |
| icons | `Icon` — one inline set, no sprite fetch | atom |
| text field | `Field` | atom |
| search field | the GET form in `TopBar` | organism |
| user avatar | `Avatar`, `UserBadge` | atom |
| side bar menu | `Sidebar` | organism |
| table | `ItemTable` | organism |
| database/table | `Sidebar`'s Databases section + the `/db/[slug]` table | organism |
| comments | `CommentComposer` + the thread in `DetailPanel` | organism |

The full tree:

| Level | Components |
| --- | --- |
| **Atoms** | `Icon`, `Button` / `ButtonLink`, `IconButton` / `IconButtonLink`, `Chip` / `ContainerBadge` / `ContainerDot`, `Field`, `Avatar`, `UserBadge`, `SyncPill`, `ThemeToggle` |
| **Molecules** | `ContainerRow`, `EmptyState`, `Modal`, `WeightMeter` |
| **Organisms** | `TopBar`, `Sidebar`, `WorkspaceShell`, `QuickAccess`, `ContainerActions`, `ItemTable`, `DetailPanel`, `CommentComposer`, `RealtimeSync`, `OptimisticItems`, and the five dialogs (`MoveItemDialog`, `ItemEditorDialog`, `ContainerEditorDialog`, `ShareDialog`, `RevealToggle`) |
| **Pages** | `signin`, `workspace`, `database`, `character` *(stretch)*, `dice` *(stretch)* |

Two rules, checked:

- **A component that repeats is a real component.** `ContainerRow` renders once
  per container in two places (rail and drawer). `IconButton` is in the top bar,
  the strip row and the dialogs.
- **A level uses the levels below it, never above.** `WorkspaceShell` is the one
  worth naming: it is an organism composing `TopBar`, `Sidebar` and
  `QuickAccess`, and it exists because the Database screen needed the same
  chrome and a second copy of the drawer would have drifted.

---

## Step D: Sanity check — the one task that matters

*Move a torch from the Party Wagon into Kova's Pack.*

1. **Sign in** — email and password → lands on the party container.
2. **Workspace** — the Wagon is already open; the torch is a row in `ItemTable`.
3. **Click the row** — `?item=…`, the detail panel opens.
4. **Move** — `?dialog=move`, `MoveItemDialog` lists every container the
   principal may write to, and the ones they may not, disabled with a reason.
5. **Confirm** — one write to `container_objects`. `OptimisticItems` updates the
   table and the weight meter before the server answers.
6. **Back to the Workspace**, torch gone from the Wagon.

No screen in that walk was unsketched, and no step had nowhere to go back to.

State from the proposal, and where it lives:

| State | Owner |
| --- | --- |
| Which container / database is open | the URL (route segment) |
| Which item is selected, sort, search, tags, which dialog | the URL (query) |
| Sidebar drawer, rail collapsed | the URL (`?nav`, `?rail`) |
| Quick Access pins | `localStorage`, per browser |
| Theme | `localStorage`, with a `prefers-color-scheme` default |
| Who you are | an httpOnly cookie holding a user id, resolved per request |
| Everything else | Postgres |

The URL owning almost all of it is not a shortcut. TaleSpire's embedded browser
reloads often, and a panel that forgets what you were looking at every time is
worse than no panel.

---

## 5. The schema the screens sit on

`Schema.png` is the data model of record, and
[`backend/db/schema.ts`](../backend/db/schema.ts) implements it directly rather
than flattening it.

Its four design principles, and where each shows up on a screen:

| Principle (Schema.png) | Consequence in the UI |
| --- | --- |
| *Everything is an Object* | A container **is** an object — `containers.object_id` is a FK to `objects`, not an id of its own — so a chest can go inside a wagon later without a new table. |
| *Containers can contain containers* | Containment is a many-to-many edge table, so this needs no schema change to allow. |
| *An object doesn't need to know what container it is being viewed through* | `objects` has **no** `container_id`. A move is one row in `container_objects`, and an item's id never changes when it moves. |
| *The container knows how it wants to view the object* | `views` and `view_properties` hold presentation only; they never create, copy or mutate a record. |

Table by table:

| Schema.png | In the repository | |
| --- | --- | --- |
| `objects` | `objects` | plus `campaign_id`, `archived_at` (soft delete) |
| `objects_types` | `object_types` | naming only |
| `type_members` | `object_type_memberships` | naming only |
| `object_properties` | `object_properties` | JSONB value |
| `property_definitions` | `property_definitions` | |
| `object_relations` / `relation_types` | same | |
| `containers` / `container_objects` | same | |
| `blocks` | `blocks` | exists; nothing writes to it yet |

Beyond the diagram, because the diagram models a single-user PKM and Arca is a
shared table: `campaigns`, `users`, `campaign_members` (every read is evaluated
against a principal), `views` / `view_properties`, `object_references` and
`comments`.

The diagram's four **kinds of data** map onto that as: *Object Data* →
`object_properties`; *Relationship Data* → `object_relations`; *Container
Configuration* → `views.configuration`; *Derived Data* → computed at read time
and never stored, which is why the weight meter is a projection and not a
column.

---

## What is wireframed and not built

Recorded here rather than quietly dropped:

- **The object page** — title, block content, embedded Views (`Wireframe.png`
  frame 2). Needs a block editor; `blocks` has no writer.
- **The comments panel** — its own panel, Open/Resolved, resolve
  (`Wireframe.png` frame 3). Deferred on the sketch's own red sticky; needs
  `comments.resolved_at`.
- **The campaign switcher's menu.** The chevron is drawn, and there is one
  campaign, so it renders as a heading rather than a control that opens an
  empty menu.
