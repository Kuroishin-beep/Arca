# 3. Design System

**Time: 30 minutes.** A [design system](../react-theory/09-design-systems.md) is
a short, fixed set of decisions - **tokens** (colour, type, spacing), and the
reusable **components** that use them - that you make **once** so every screen
looks like it belongs to the same product. Without one, every screen drifts to
slightly different blues, paddings, and button shapes.

Use your [wireframes](02-wireframes.md) as the source: only define a token or
component if a screen actually needs it.

---

## Step A: Choose your styling approach (3 min)

Everything below is delivered differently depending on your stack, so pick it
first ([choosing your stack](../m3-styling/07-choosing-your-stack.md)). Your
tokens land in a different place in each:

| Approach | Where your tokens live |
| --- | --- |
| **CSS Modules / plain CSS** | `:root` custom properties (`--color-primary`) |
| **Tailwind** | the `theme` block in `tailwind.config.js` |
| **styled-components** | a `theme` object passed through `ThemeProvider` |
| **A UI library (MUI, Chakra)** | the library's theme object - you override its defaults |

My approach: _______________

## Step B: Colour tokens (6 min)

Pick **3 to 5 colours**, no more. Give each a **token name** - the name is what
your components reference, so you can rebrand or add a dark theme by changing one
value ([design tokens](../react-theory/09-design-systems.md)).

| Token | Role | Your colour (hex) |
| --- | --- | --- |
| `--color-primary` | links, buttons, active states | |
| `--color-accent` | one call-to-action, highlights | |
| `--color-bg` | page background | |
| `--color-surface` | cards, panels | |
| `--color-text` | body text | |

Check every text-on-background pair reaches at least **4.5 : 1 contrast** (run it
through the WebAIM Contrast Checker).

## Step C: Type scale (6 min)

You do not need fancy fonts. Decide **3 sizes** and when each is used - that is
enough for this project. These become type tokens too (`--font-size-lg`, or
Tailwind's `text-2xl`).

| Style | Size | Weight | Used for |
| --- | --- | --- | --- |
| Heading | | Bold | screen and section titles |
| Body | | Regular | paragraphs, lists |
| Small | | Regular | captions, labels, footer |

## Step D: Spacing rule (4 min)

Pick **one base unit** (commonly 8px) and use multiples of it everywhere -
padding, gaps, margins. Write your scale as tokens:

- Tight spacing (between related items): ___ px  (`--space-1`)
- Standard spacing (between sections): ___ px  (`--space-4`)
- Screen edge padding: ___ px

This single rule is what makes a UI feel "designed" instead of ad hoc - more
valuable than picking exact pixel values.

## Step E: Reusable components (6 min)

Pull these straight from your [component tree](02-wireframes.md) (Step C). List
every component that shows up on **more than one screen** - these are the
atoms/molecules of your design system. Describe each once so every screen renders
the same version.

| Component | Level | Appears on | Props it takes |
| --- | --- | --- | --- |
| _e.g. `Card`_ | molecule | Home, Detail | `title`, `body`, `image` |
| _e.g. `Button`_ | atom | everywhere | `variant`, `onClick`, `children` |
| | | | |

Common ones worth checking for: a **`Button`**, a **`Card`** (repeated list
item), the **`Header`/nav**, and the **`Footer`**. If you adopt a UI library,
note which of these you get for free and which you still build yourself.

## Step F: Responsive plan (5 min)

Where does your layout change, and to what? Note your breakpoint(s).

- Below ___ px (phone): _(e.g. cards stack to one column, nav collapses)_
- Above ___ px (desktop): _(e.g. cards sit three across via Grid)_

These become the `min-width` values in your media queries (or Tailwind's `md:` /
`lg:` prefixes). Remember the hard requirement: **no horizontal scrolling on a
375px-wide phone.**

## Accessibility check (before you build)

Tick each one - these are scored by the [design rubric](../m3-styling/ASSESSMENT.md):

- [ ] Every text-on-background pair passes 4.5 : 1 contrast
- [ ] Real semantic elements (`<header>`, `<nav>`, `<main>`, `<button>`), not a
      `<div>` with an `onClick` for everything
- [ ] Every meaningful image has `alt` text (decorative ones use `alt=""`)
- [ ] Every form input has a matching `<label>` (`htmlFor` + `id`)
- [ ] You can reach every link and button with the Tab key, and see the focus

## What to keep

This page - filled in - is your design reference for the whole project. When you
start building:
- Your **colour, type, and spacing tokens** become your theme (`:root`
  variables, `tailwind.config.js`, or a `ThemeProvider` theme).
- Each **reusable component** becomes one component in `src/components/`, built
  once and rendered everywhere it appears.
- Your **responsive plan** becomes your media queries or breakpoint prefixes.

Keep this file (or a photo of it) - it is the reference you open every time you
build a new component, so the whole app stays consistent without you re-deciding
it each time.
