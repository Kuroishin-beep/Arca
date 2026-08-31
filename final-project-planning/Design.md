# Arca — Design System (`Design.md`)

The filled-in version of [03-design-system.md](03-design-system.md). This is the
reference you open every time you build a component. Machine-readable copies of
everything here live in [`mockups/tokens.css`](../mockups/tokens.css) and
[`mockups/tailwind.config.js`](../mockups/tailwind.config.js) for the static
mockups, and in [`frontend/styles/globals.css`](../frontend/styles/globals.css)
for the app. All three carry the same values; this document explains *why* each
value is what it is.

The five colour anchors are not decided here — they are decided in
[03-design-system.md](03-design-system.md) Step B, which is the submitted
worksheet and therefore the palette of record. Everything below either quotes
that worksheet or derives from it in the same family, because a five-colour
worksheet cannot describe a three-level surface ladder or four semantic
states.

> **Hard rule for this project: no gradients.** Every fill is a solid colour.
> Depth comes from three flat surface levels plus a hairline border, never from
> a colour ramp. A gradient inside a TaleSpire Symbiote panel competes with the
> 3-D scene rendering behind it and reads as visual noise; flat blocks do not.

---

## Step A — Styling approach

**Tailwind CSS, with tokens declared as CSS custom properties and the Tailwind
theme referencing those variables.**

Chosen because it is the only approach that satisfies both constraints at once:

- The tokens live in one plain CSS file (`:root`), so a theme swap or a light
  mode is one file, not a rebuild.
- Components stay as utility classes on semantic HTML, so a mockup's `<tbody>`
  block becomes a `.tsx` file by copy-paste — no CSS module to port, no
  `styled-components` runtime shipped to a panel that has to stay light.

Where they land: **all of it in `frontend/styles/globals.css`**. Tailwind v4 is
CSS-first and has no `tailwind.config.ts` — canonical tokens are declared on
`:root`, and an `@theme inline` block maps them onto Tailwind's utility
namespaces so `--color-surface-2` drives `bg-surface2`. One file, two roles:
the tokens a designer reads and the theme the compiler reads.

(The static mockups in `mockups/` predate the app and use the Tailwind **v3**
CDN, so they carry an equivalent `tailwind.config.js`. The token names and every
utility class match, which is what makes the markup port unchanged.)

---

## Step B — Colour tokens

Five core roles, plus semantics. Deliberately small.

| Token | Role | Hex |
| --- | --- | --- |
| `--color-primary` | links, active nav, primary buttons | `#D2C088` |
| `--color-accent` | secondary action, party-owned things | `#6DB8A6` |
| `--color-bg` | app background | `#1B1B1B` |
| `--color-surface` | cards, sidebar, panels | `#212121` |
| `--color-text` | body text | `#F2F2F2` |

All five are the worksheet's own values, unchanged.

Supporting: `--color-surface-2` `#2A2A2A` (hover/selected/inputs),
`--color-surface-3` `#343434` (menus), `--color-border` `#333333`,
`--color-border-strong` `#6B6B6B`, `--color-text-muted` `#A8A8A8`.

Semantic: success `#6BBF7B`, warning `#D9A441`, danger `#DC6F66`, info `#7FA8D9`.
These are the only hues that sit off-palette, and they do so on purpose: "over
capacity" and "offline" are warnings, and rendering them in the same gold as
everything else would make the app prettier and strictly less informative. Each
has a `-weak` solid tint (e.g. `--color-danger-weak: #2E1A18`) used as a chip
background — a **flat tint, not an opacity layer**, so chips render identically
over any surface level.

### Container-type hues

The one piece of colour that carries meaning rather than decoration. Container
type is the thing a player misreads most often ("wait, was that the party's or
mine?"), so it gets a fixed hue everywhere it appears — sidebar dot, breadcrumb,
detail-panel header, move-dialog target:

| Type | Token | Hex | Means |
| --- | --- | --- | --- |
| `character` | `--color-container-character` | `#D2C088` gold | your own pack |
| `party` | `--color-container-party` | `#6DB8A6` teal | the shared wagon/stash |
| `world` | `--color-container-world` | `#A98CD0` violet | dungeon chest, GM-owned |

Colour is never the *only* signal — every container row also carries a distinct
icon and a text label, so this survives colour-blindness and greyscale.

### Contrast (WCAG AA — 4.5:1 body, 3:1 large text and UI)

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `--color-text` on `--color-bg` | 15.4 : 1 | AAA |
| `--color-text` on `--color-surface` | 14.4 : 1 | AAA |
| `--color-text-muted` on `--color-bg` | 7.2 : 1 | AAA |
| `--color-text-muted` on `--color-surface-2` | 6.0 : 1 | AAA |
| `--color-primary` on `--color-bg` | 9.5 : 1 | AAA |
| `--color-text-invert` on `--color-primary` | 9.5 : 1 | AAA (gold button) |
| `--color-accent` on `--color-surface` | 6.9 : 1 | AAA |
| `--color-danger` on `--color-surface` | 5.0 : 1 | AA |

`--color-text-faint` `#6E6E6E` (3.4:1) is **disabled-state only** and never
carries information — it fails AA for body copy on purpose, as a guardrail.

### The light variant

The worksheet names one palette and it is the dark one, so dark is `:root` and
light is an addition rather than a second reading of the design system. It is
labelled as one in `globals.css`, and it exists because the theme toggle
shipped — deleting a working control to satisfy a document that never ruled on
it would be a downgrade, not compliance.

Light is the **same two hues, deepened until they carry text on paper**, not two
substituted hues. `#D2C088` is 1.7:1 on white and cannot be an interactive
colour there, so light mode uses a darker step of the same gold: `#7A6420`
(5.4:1 on `#FAF9F6`), with teal `#2F6F62` (5.6:1). Every pair in the light block
clears 4.5:1 by the same rule as the table above.

---

## Step C — Type scale

No web font. A Symbiote panel loads inside TaleSpire's embedded browser and a
font request is a visible flash on every open, so headings use the system serif
stack and everything else the system sans.

| Style | Token | Size / line | Weight | Used for |
| --- | --- | --- | --- | --- |
| Screen title | `--font-size-xl` | 20 / 28 | Bold, serif | container name, modal titles |
| Section title | `--font-size-lg` | 16 / 24 | Bold, serif | sidebar group headers, panel sections |
| Body | `--font-size-base` | 14 / 20 | Regular | table cells, form values, notes |
| Label | `--font-size-sm` | 12 / 18 | Medium | field labels, column headers, buttons |
| Meta | `--font-size-xs` | 11 / 16 | Regular | chips, counts, timestamps |

14px body rather than 16px: the panel is ~380px wide and the primary content is
a dense table. 14/20 fits the columns that matter (name, qty, weight) without
truncation; 16px does not. Nothing drops below 11px anywhere.

Numeric columns (qty, weight, value) use `--font-mono` with tabular figures so
digits align down the column and a total is scannable without reading it.

---

## Step D — Spacing

**Base unit: 4px.** Chosen over 8px because a 36px table row and a 48px top bar
are both required and both are 4-divisible; an 8px grid forces every row to 40px
and costs about two visible rows of inventory in a docked panel.

| Token | Value | Used between |
| --- | --- | --- |
| `--space-1` | 4px | icon and its label |
| `--space-2` | 8px | inside a control (button padding) |
| `--space-3` | 12px | related rows, table cell padding |
| `--space-4` | 16px | card padding, **screen edge padding** |
| `--space-5` | 24px | between sections |
| `--space-6` | 32px | between major blocks |
| `--space-8` | 48px | empty-state breathing room |

Tight spacing: **4px**. Standard spacing: **16px**. Screen edge: **16px**
(12px below the `panel` breakpoint).

Radius: `sm` 3px (chips), `md` 5px (buttons, inputs, rows), `lg` 8px (cards,
modals). Kept small — Arca is a strongbox, not a consumer app.

---

## Step E — Reusable components

Everything that appears on more than one screen, sorted by atomic level. The
`Level` column is also the folder under `frontend/components/`.

| Component | Level | Appears on | Props |
| --- | --- | --- | --- |
| `Button` | atom | everywhere | `variant: 'primary' \| 'secondary' \| 'ghost' \| 'danger'`, `size`, `icon`, `disabled`, `onClick`, `children` |
| `IconButton` | atom | top bar, rows, panel | `icon`, `label` (required — becomes `aria-label`), `onClick` |
| `Input` | atom | search, forms, modals | `id`, `label`, `value`, `onChange`, `error`, `type` |
| `NumberStepper` | atom | item editor, move dialog | `value`, `min`, `max`, `onChange` |
| `Chip` | atom | table rows, detail panel | `tone: 'neutral' \| 'primary' \| 'accent' \| 'success' \| 'warning' \| 'danger'`, `children` |
| `ContainerBadge` | atom | sidebar, breadcrumb, move dialog | `type: ContainerType`, `showLabel` |
| `Avatar` | atom | top bar, comments | `name`, `role`, `size` |
| `SyncPill` | atom | top bar (every screen) | `status: 'idle' \| 'syncing' \| 'error'`, `lastSyncedAt` |
| `WeightMeter` | molecule | footer bar, character sheet | `carried`, `capacity` |
| `SearchField` | molecule | top bar | `value`, `onChange`, `onClear`, `placeholder` |
| `ContainerRow` | molecule | sidebar, move dialog | `container`, `itemCount`, `selected`, `onSelect` |
| `ItemRow` | molecule | item table | `item`, `selected`, `onSelect`, `onMove`, `canEdit` |
| `EmptyState` | molecule | every list surface | `icon`, `title`, `body`, `action` |
| `CommentCard` | molecule | detail panel | `author`, `content`, `createdAt`, `onReply` |
| `Modal` | molecule | move, editor, confirm | `title`, `onClose`, `footer`, `children` |
| `Sidebar` | organism | workspace, sheet, dice | `containers`, `selectedId`, `collapsed`, `onToggleCollapse`, `onItemSelect` |
| `TopBar` | organism | every screen | `user`, `syncStatus`, `searchQuery`, `onSearchChange` |
| `ItemTable` | organism | workspace | `items`, `sort`, `onSortChange`, `selectedId` |
| `DetailPanel` | organism | workspace | `item`, `comments`, `canEdit`, `onClose` |
| `MoveItemDialog` | organism | workspace | `item`, `containers`, `onConfirm`, `onCancel` |
| `WorkspaceLayout` | layout | workspace, sheet, dice | composes `TopBar` + `Sidebar` + slot + `DetailPanel` |

`ItemRow` earns its place by the rule in the worksheet: it repeats, so it is a
real component rendered from a `.map()` with a stable `key={item.id}`.

---

## Step F — Responsive plan

Arca has an unusual primary target: a **docked TaleSpire Symbiote panel**, which
is narrow and tall and is the *default* case, not the degraded one. So the
layout is authored at `panel` width first and widened up.

| Breakpoint | Width | Layout |
| --- | --- | --- |
| **Below `panel`** | < 380px | Single column. Sidebar becomes a drawer over content. Table drops to a two-line stacked card per item (name + tags on line 1; qty, weight, container on line 2). Detail panel becomes a full-screen sheet. Footer summary collapses to `12 · 34.5kg`. |
| **`panel`** | 380px+ | Sidebar as a 48px icon rail, expandable on click. Table shows Name / Qty / Weight. Detail panel still overlays. |
| **`md`** | 768px+ | Sidebar pinned at 248px. Table adds Value and Tags columns. Detail panel overlays as a right sheet. |
| **`lg`** | 1024px+ | Three-pane: sidebar + table + 320px detail panel, all pinned, no overlay. Table adds Notes and the row-action column. |
| **`xl`** | 1280px+ | Same three-pane; table gains a max-width and centres, columns stop stretching. |

**No horizontal scrolling at 375px.** The table is the only element that could
break this, and below `panel` it stops being a table layout entirely rather than
scrolling sideways. Where a wide element is genuinely unavoidable it gets its own
`overflow-x-auto` container — the page body never scrolls sideways.

---

## Accessibility checklist

- [x] Every text-on-background pair reaches 4.5 : 1 (table above; `--color-text-faint` is disabled-only by design)
- [x] Real semantic elements — `<header>`, `<nav>`, `<main>`, `<aside>`, `<table>`, `<button>`; no `<div onClick>`
- [x] Every icon-only control carries a name — either a `.sr-only` span beside the glyph, or the required `label` prop on `IconButton`, which becomes both the `aria-label` and the `title` so the two cannot drift apart
- [x] Every input has a `<label for>` / `htmlFor` pair
- [x] One visible focus treatment defined once in `tokens.css` and never removed
- [x] Container type is signalled by icon + text + colour, never colour alone
- [x] Sort state is announced via `aria-sort` on the `<th>`, not just an arrow glyph
- [x] Live-sync updates land in an `aria-live="polite"` region so a screen reader hears "3 items moved to Party Wagon"
- [x] Modals trap focus, close on `Esc`, and return focus to the control that opened them
- [x] Hit targets are at least 32x32 in the panel and 44x44 below `panel`

---

## What each token becomes in Next.js

| Here | There | Status |
| --- | --- | --- |
| `:root` block in `mockups/tokens.css` | `:root` in `frontend/styles/globals.css` | done |
| `theme.extend` in `mockups/tailwind.config.js` | `@theme inline` in `frontend/styles/globals.css` (v4 is CSS-first) | done |
| Each row of Step E | one file in `frontend/components/<level>/` | done |
| Each row of Step F | a Tailwind `panel:` / `md:` / `lg:` prefix | done |

Two layout tokens have no Tailwind namespace in v4 (`--topbar-h`, `--sidebar-w`,
`--detail-w`) and are used as `h-[var(--topbar-h)]` rather than `h-topbar`. The
token stays the single source of truth either way.
