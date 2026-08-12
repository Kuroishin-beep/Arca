# 2. Wireframes & Component Breakdown

**Time: 45 minutes.** Use the section list from your [proposal](01-proposal.md).
Sketch on paper, a whiteboard, or a free tool (Excalidraw, Figma, Google
Drawings) - boxes and labels only, no colours or fonts yet. That is step 3.

A wireframe is a rough box-and-label sketch of what is *on* a screen and *where*,
not what it looks like. If you are picking a colour right now, you are a step
ahead of yourself - come back to that later. The payoff for a React app is
specific: **every box you draw is a component you will build.**

---

## Step A: Screen map (10 min)

Before drawing screens, map how a user moves **between** them. Draw a box per
section or route (just the name) and an arrow for every navigation, labelled with
what the user clicks to make that jump.

```
[Home] --"click a deck"--> [Study deck] --"flip"--> [Card back]
   |
"click New deck"
   v
[Deck editor]
```

Questions this should answer:
- What is the **first screen** the user lands on?
- Is there a "home base" most others return to? (That is your nav.)
- Any screen with **no way back**? That is usually a bug in the plan, not just
  the app.

> Single-page portfolio? Your "map" is just the scroll order of your sections
> (hero -> about -> projects -> contact) plus the nav that jumps between them.

## Step B: One box-sketch per screen (20 min)

For **every** screen, sketch its layout at **two widths: phone and desktop**.
React apps reflow like any web page, so plan both now
([Flexbox and Grid](../m3-styling/05-responsive-layout-flexbox-grid.md)). For
each screen, note:

- **Header / nav** - usually the same on every screen (a shared layout).
- **Main content** - the boxes unique to this screen. Label each one ("row of
  cards", "add-card form") - do not draw real content.
- **Footer** - usually shared.
- **What changes on a phone** - does a 3-column grid become a single stack? Does
  the nav collapse? Mark it. This becomes your media queries or Tailwind
  breakpoints.

A simple table works if you are not comfortable free-sketching:

| Screen | Desktop layout | Phone layout (what stacks) | Navigates to |
| --- | --- | --- | --- |
| | | | |

## Step C: Break it into a component tree (10 min)

This is the React-specific step. Take your busiest screen and draw a box around
every **repeated or self-contained** piece. Each box is a component. Then sort
them into [atomic-design](../react-theory/08-atomic-design.md) levels - it gives
you both a name and a folder for each one:

| Level | What it is | Your components |
| --- | --- | --- |
| **Atoms** | smallest pieces: `Button`, `Input`, `Tag` | |
| **Molecules** | small groups of atoms: `SearchBar`, `Card`, `FormField` | |
| **Organisms** | whole sections: `Header`, `DeckList`, `ProjectsGrid` | |
| **Page / layout** | the screen that arranges organisms | |

Two rules to sanity-check:
- **A component that repeats is a real component.** If a "card" appears five
  times, you build `<Card />` once and render it in a list with keys.
- **A level uses the levels below it, never above.** An `Atom` never imports an
  `Organism`.

> This is your first pass at
> [component architecture](../react-theory/05-component-architecture.md) and your
> [`src/components/` folders](../react-theory/07-project-structure-and-organization.md).
> You do not have to be perfect - a card being a "molecule" or an "organism" is a
> judgement call.

## Step D: Sanity check (5 min)

Walk through your **one most important user task** (for example "add a card and
study it") screen by screen, following your own map and sketches.

- Did you hit a screen you forgot to sketch? Add it now.
- Did any navigation have nowhere to go? Fix the screen map.
- Does every piece of state from your [proposal](01-proposal.md) have a component
  that owns it? If not, decide where it lives.

## What to keep

Hang on to your screen map, sketches, and component tree (a phone photo of paper
is fine). When you start building:
- Your **screen map** becomes your routes (or scroll sections) and your nav.
- Each **box** becomes a **component** in `src/components/`, sorted into the
  atomic folders you chose in Step C.
- Your "what stacks on a phone" notes become your **media queries** (or Tailwind
  `md:` prefixes).
