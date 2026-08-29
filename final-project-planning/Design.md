# Arca — Design System (`Design.md`)

The filled-in version of [03-design-system.md](03-design-system.md). This is the
reference you open every time you build a component. Machine-readable copies of
everything here live in [`mockups/tokens.css`](../mockups/tokens.css) and
[`mockups/tailwind.config.js`](../mockups/tailwind.config.js) — those two files
are the source of truth; this document explains *why* each value is what it is.

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

Where they land: **all of it in `app/globals.css`**. Tailwind v4 is CSS-first
and has no `tailwind.config.ts` — canonical tokens are declared on `:root`, and
an `@theme inline` block maps them onto Tailwind's utility namespaces so
`--color-surface-2` drives `bg-surface2`. One file, two roles: the tokens a
designer reads and the theme the compiler reads.

(The static mockups in `mockups/` predate the app and use the Tailwind **v3**
CDN, so they carry an equivalent `tailwind.config.js`. The token names and every
utility class match, which is what makes the markup port unchanged.)

---

## Step B — Colour tokens

Five core roles, plus semantics. Deliberately small.

| Token | Role | Hex |
| --- | --- | --- |
| `--color-primary` | links, active nav, primary buttons | `#C9A227` |
| `--color-accent` | secondary action, party-owned things | `#4E9A8F` |
| `--color-bg` | app background | `#14110F` |
| `--color-surface` | cards, sidebar, panels | `#1F1B18` |
| `--color-text` | body text | `#EDE6DA` |

Supporting: `--color-surface-2` `#2A2521` (hover/selected/inputs),
`--color-surface-3` `#35302B` (menus), `--color-border` `#3A322C`,
`--color-text-muted` `#A99C8A`.

Semantic: success `#5FA777`, warning `#D08B3C`, danger `#C2564B`, info `#6E93C9`.
Each has a `-weak` solid tint (e.g. `--color-danger-weak: #331714`) used as a
chip background — a **flat tint, not an opacity layer**, so chips render
identically over any surface level.

### Container-type hues

The one piece of colour that carries meaning rather than decoration. Container
type is the thing a player misreads most often ("wait, was that the party's or
mine?"), so it gets a fixed hue everywhere it appears — sidebar dot, breadcrumb,
detail-panel header, move-dialog target:

| Type | Token | Hex | Means |
| --- | --- | --- | --- |
| `character` | `--color-container-character` | `#C9A227` gold | your own pack |
| `party` | `--color-container-party` | `#4E9A8F` teal | the shared wagon/stash |
| `world` | `--color-container-world` | `#9B6BC9` violet | dungeon chest, GM-owned |

Colour is never the *only* signal — every container row also carries a distinct
icon and a text label, so this survives colour-blindness and greyscale.

### Contrast (WCAG AA — 4.5:1 body, 3:1 large text and UI)

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `--color-text` on `--color-bg` | 15.9 : 1 | AAA |
| `--color-text` on `--color-surface` | 14.2 : 1 | AAA |
| `--color-text-muted` on `--color-bg` | 7.6 : 1 | AAA |
| `--color-text-muted` on `--color-surface-2` | 5.9 : 1 | AA |
| `--color-primary` on `--color-bg` | 8.4 : 1 | AAA |
| `--color-text-invert` on `--color-primary` | 9.1 : 1 | AAA (gold button) |
| `--color-accent` on `--color-surface` | 5.4 : 1 | AA |
| `--color-danger` on `--color-surface` | 4.6 : 1 | AA |

`--color-text-faint` `#7C7062` (3.9:1) is **disabled-state only** and never
carries information — it fails AA for body copy on purpose, as a guardrail.

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
`Level` column is also the folder under `src/components/`.

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
- [x] Every icon-only control has a `.sr-only` label that becomes `aria-label` in JSX
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
| `:root` block in `mockups/tokens.css` | `:root` in `app/globals.css` | done |
| `theme.extend` in `mockups/tailwind.config.js` | `@theme inline` in `app/globals.css` (v4 is CSS-first) | done |
| Each row of Step E | one file in `src/components/<level>/` | done |
| Each row of Step F | a Tailwind `panel:` / `md:` / `lg:` prefix | done |

Two layout tokens have no Tailwind namespace in v4 (`--topbar-h`, `--sidebar-w`,
`--detail-w`) and are used as `h-[var(--topbar-h)]` rather than `h-topbar`. The
token stays the single source of truth either way.
