# Planning Your Final Project

Your final project is a **React app** of your own, built with the same Node
toolchain (Vite + npm) you have used all along. Before writing any JSX, you are
going to plan it: what it is, what it looks like, and how it breaks down into
components. This is a **planning session** - no code, just paper (or Docs) and
decisions.

You will produce four documents. Do the first three in order - each one leans on
the last - then close with the reflection journal.

| # | Document | Time | What it answers |
| - | --- | --- | --- |
| 1 | [Proposal](01-proposal.md) | 45 min | What is this app, who is it for, and what sections or routes does it need? |
| 2 | [Wireframes & components](02-wireframes.md) | 45 min | What does each screen hold, and how does it break down into a component tree? |
| 3 | [Design System](03-design-system.md) | 30 min | What tokens, type, and reusable components make every screen look like one product? |
| 4 | [Reflection Journal](04-reflection-journal.md) | 30 min | What have I learned in this course so far, and how does it feed this project? |

That is about two and a half hours. If you finish early, do a second pass of your
component breakdown or tighten your section list - both pay off later.

**How it is graded:** 100 points, 25 per document. The full rubric with levels is
in [RUBRIC.md](RUBRIC.md). Planning is scored on being specific, honest, and
consistent - not on being "right".

Two slide decks cover the "how" behind Docs 2 and 3, with sources cited on every
slide: [wireframing-slides.html](wireframing-slides.html) and
[design-systems-slides.html](design-systems-slides.html) (open in a browser;
print to PDF for a handout). Skim them before, or during, the matching
worksheet.

The design theory in [`react-theory/`](../react-theory/) covers the "why" behind
all three: [component architecture](../react-theory/05-component-architecture.md),
[atomic design](../react-theory/08-atomic-design.md), and
[design systems](../react-theory/09-design-systems.md). The
[Module 3 styling reading](../m3-styling/README.md) covers the "how": responsive
[Flexbox and Grid](../m3-styling/05-responsive-layout-flexbox-grid.md) and
[choosing your styling stack](../m3-styling/07-choosing-your-stack.md). Skim them
alongside the worksheets.

## Why this order, and why it matters

- **Proposal before wireframes:** you cannot sketch a screen for a feature you
  have not decided to include. Cutting a section on paper is free; cutting it
  after you have built the components is not.
- **Wireframes before design system:** the design system should serve the
  components you actually need (a `Card` only exists because your wireframes
  repeat one across screens). Do not invent components in the abstract.
- **Design system before code:** your tokens, type, spacing, and components map
  almost directly onto your theme (CSS variables, a Tailwind config, or a
  styled-components theme) and your `src/components/` folders on the first day you
  start building.

You are not doing extra work; you are doing the same work earlier, on paper,
where mistakes cost nothing. This planning maps straight onto how the project is
graded: the [design rubric](../m3-styling/ASSESSMENT.md) rewards a coherent design
system, sensible component organization, and responsive quality - exactly the
three things these worksheets decide.
