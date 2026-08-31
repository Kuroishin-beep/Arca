# Arca

TaleSpire Symbiote for our Dragonbane Westmarch campaign: a GUI database for tracking inventories across containers, with live sync and real-time collaboration. Stretch goal adds character sheets (attributes, skills, equipment, spells) plus diceFinder, parsing dice notation for one-click TaleSpire rolls.

## Run it

No database needed. The app boots against an in-memory fixture repository, seeded
with the campaign's real containers and items.

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and sign in with your email address, choosing a
password the first time (fill in the confirm field on that first sign-in only).
The seeded addresses are `ravna@`, `kova@` and `milo@ravenholt.example`.
**Which member you sign in as changes what you can see** — that is the
permission model, not a demo mode. Sign in as Kova and the sealed vault is not
in the sidebar and not in the page source; sign in as the GM and it is.

There is no OAuth provider and no sign-up. Membership is the campaign roster,
which stays a GM decision; the address is the identity and the password is what
stops anyone holding the link from sitting down as the GM. There is no reset
mail because there is no mail — a forgotten password is one statement for the
GM, which puts that member back at "choose a password":

```sql
UPDATE users SET password_hash = NULL WHERE email = 'kova@ravenholt.example';
```

| Script | What it does |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest — permissions, the move operation, derived weights, databases, passwords, the dice parser |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright — two browser contexts, one campaign, live sync |
| `npm run db:generate` | SQL migration from `backend/db/schema.ts` |
| `npm run db:migrate` | apply migrations |
| `npm run db:seed` | seed a real database |

## Attach a database

```bash
docker compose up -d          # postgres:17 on localhost:5432
cp .env.example .env.local    # then set DATABASE_URL
npm run db:migrate && npm run db:seed
```

The app switches from fixtures to the object-graph schema automatically — the
sign-in screen prints which backend is live, as `storage: … · sync: … · auth: …`.

The app should look **identical** either way. If it does not, the projection
layer and the fixture repository have drifted, which is exactly what that
comparison is for.

Two things only exist with a real database: the CHECK constraints behind the
ownership invariants, and the `LISTEN`/`NOTIFY` channel that carries live sync.
Fixtures fan out through an in-process emitter instead, which works for one dev
server and would silently deliver nothing on serverless.

## Backend and frontend

The two halves live in separate directories and are wired by path aliases, not
by HTTP. It is still one Next.js app and one deployment — SCOPE.md §4.2 rejects
a second deployable for a table of six people, and nothing here changes that.

```
backend/     @backend/*   server only — never imported by a client component
  db/          object-graph schema, both repository implementations, seed
  domain/      zod domain model and the flat projection the UI renders
  actions/     Server Actions: create, update, archive, move, comment
  realtime/    the fan-out boundary: LISTEN/NOTIFY and the in-process fallback
  api/         the SSE handler
  lib/         session, passwords, permissions, campaign, TaleSpire adapter
frontend/    @frontend/*  UI
  routes/      one file per screen — the page implementations
  components/  atoms / molecules / organisms, per Design.md Step E
  styles/      globals.css: tokens and the @theme block
app/         Next's routing layer ONLY — see app/README.md
```

`app/` is a thin shim because Next discovers routes at `<root>/app` and offers
no option to point it elsewhere. Each file there maps a URL to an
implementation and holds nothing else.

## Where things are

| Path | What |
| --- | --- |
| [`SCOPE.md`](SCOPE.md) | the full scope document — features, milestones, risks, acceptance criteria |
| [`final-project-planning/Design.md`](final-project-planning/Design.md) | design system: tokens, type scale, spacing, components, responsive plan |
| [`docs/research/`](docs/research/superhuman-docs-and-capacities.md) | the Superhuman Docs / Capacities research the model came from |
| [`mockups/`](mockups/index.html) | static HTML mockups — open `index.html` |
| `drizzle/` | checked-in SQL migrations |
| `e2e/` | Playwright: the move flow across two browser contexts |

## The one thing to understand

Objects own data. Containers own containment. Views own presentation.

An item has no location — it has a containment **edge**. So moving one between
containers is a write to a single row, and the item's id, properties, notes and
comments are untouched. Everything else in the codebase follows from that.
