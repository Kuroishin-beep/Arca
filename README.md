# Arca

TaleSpire Symbiote for our Dragonbane Westmarch campaign: a GUI database for tracking inventories across containers, with live sync and real-time collaboration. Stretch goal adds character sheets (attributes, skills, equipment, spells) plus diceFinder, parsing dice notation for one-click TaleSpire rolls.

## Run it

No database needed. The app boots against an in-memory fixture repository, seeded
with the campaign's real containers and items.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, then pick a member on the sign-in screen. **Which
member you pick changes what you can see** — that is the permission model, not a
demo mode. Sign in as Kova and the sealed vault is not in the sidebar and not in
the page source; sign in as the GM and it is.

| Script | What it does |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest — permissions, the move operation, derived weights, the dice parser |
| `npm run db:generate` | SQL migration from `src/db/schema.ts` |
| `npm run db:migrate` | apply migrations |
| `npm run db:seed` | seed a real database |

## Attach a database

Copy `.env.example` to `.env.local` and set `DATABASE_URL`. The app switches from
fixtures to the object-graph schema automatically — the sign-in screen prints
which one is live. Then:

```bash
npm run db:migrate && npm run db:seed
```

The app should look **identical** either way. If it does not, the projection
layer and the fixture repository have drifted, which is exactly what that
comparison is for.

## Where things are

| Path | What |
| --- | --- |
| [`SCOPE.md`](SCOPE.md) | the full scope document — features, milestones, risks, acceptance criteria |
| [`final-project-planning/Design.md`](final-project-planning/Design.md) | design system: tokens, type scale, spacing, components, responsive plan |
| [`docs/research/`](docs/research/superhuman-docs-and-capacities.md) | the Superhuman Docs / Capacities research the model came from |
| [`mockups/`](mockups/index.html) | static HTML mockups — open `index.html` |
| `app/` | routes: sign-in, workspace, character sheet, diceFinder |
| `src/components/` | atoms / molecules / organisms, per Design.md Step E |
| `src/db/` | object-graph schema, both repository implementations, seed |
| `src/domain/` | zod domain model and the flat projection the UI renders |
| `drizzle/` | checked-in SQL migrations |

## The one thing to understand

Objects own data. Containers own containment. Views own presentation.

An item has no location — it has a containment **edge**. So moving one between
containers is a write to a single row, and the item's id, properties, notes and
comments are untouched. Everything else in the codebase follows from that.
