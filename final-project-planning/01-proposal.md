# 1. App Proposal

A GUI Database for TTRPG character sheets and campaign-wide inventory management
in a Webapp with TaleSpire integration for an all-in-one screen play experience.

---

## App name

Arca (Latin for chest or strongbox)

## What the app is for, in one sentence

A TTRPG-centric PKM tool that lets game masters and players manage their
Character sheets and inventories native to TaleSpire's App Window.

> Bad: "An app about tasks."
> Good: "A study app that lets a student build flashcard decks from their notes
> and drill the ones they keep getting wrong."

## Who is it for

- The TTRPG community, game masters and players
- View and manage their character sheets and relevant inventories

## Sections or routes this app needs

List every top-level screen. A single-page app (like the portfolio) has
**sections** on one route; a multi-screen app uses **routes**
([React Router](../m2-react/README.md)). Aim for **3 to 5** either way. For each,
one sentence on what it is for. If you go over 5, cut one.

| # | Section | What it is for |
| - | --- | --- |
| 1 | Login |  |
| 2 | Workspace |  |
| 3 |  |  |
| 4 |  |  |

> Test each one: if you removed it, could the user still do the main thing
> above? If yes, it may not be core - park it for later.

## State: what data does the app hold?

React apps are mostly about **state**. For your **most important screen**, name
the pieces of data it manages and where they live. (A deck is an array of
`{ id, question, answer }` objects; a filter is a string; a "selected card" is an
index.) You do not need final shapes yet - just name them.

| Data | Shape (rough) | Who owns it (which component) | Changes when... |
| --- | --- | --- | --- |
| _e.g. cards_ | `[{ id, question, answer }]` | `App` | user adds / deletes a card |
| | | | |

> This is your first pass at [state ownership](../react-theory/06-state-management.md):
> state lives in the lowest component that needs it, and is passed down as props.

## What each screen contains

For your **most important screen**, list the blocks of content it needs (a
heading, an input row, a list of cards, a footer...). These become the
**components** you break it into on the next worksheet.

- Screen: _(name)_
  - Block 1:
  - Block 2:
  - Block 3:

## Content you need to gather

What real text, data, and images do you need before you can build? (Sample deck
data, project descriptions, photos, a logo, an API if you use one.) List them now
so you are not stuck hunting for them mid-build.

-
-

## One risk

What is the one part of this app you are least sure how to build? (A specific
piece of state, a layout, a library you have not used.) Naming it now means you
can ask for help on it early, instead of the night before it is due.
