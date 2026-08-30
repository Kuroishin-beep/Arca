# `app/` — the routing layer only

Next.js discovers routes at `<root>/app` or `<root>/src/app` and nowhere else:
as of Next 16 there is no `appDir` or `srcDir` option to point it at
`frontend/app`. So this directory has to exist here, and the split is drawn one
level in instead.

Every file here is deliberately trivial — a URL mapped to an implementation:

| Route | Implementation |
| --- | --- |
| `/` | `frontend/routes/home.tsx` |
| `/signin` | `frontend/routes/signin.tsx` |
| `/c/[containerId]` | `frontend/routes/workspace.tsx` |
| `/character/[containerId]` | `frontend/routes/character.tsx` |
| `/dice` | `frontend/routes/dice.tsx` |
| `/api/stream` | `backend/api/stream.ts` |
| `/api/auth/*` | `backend/lib/auth.ts` |

Route **segment config** (`runtime`, `dynamic`, `maxDuration`) stays written out
here rather than re-exported. Next reads those by statically analysing the route
file, and a value that arrives through a re-export is not reliably seen — an
SSE route silently falling back to the Edge runtime is a bad way to discover
that.

Nothing else belongs in this directory. UI goes in `frontend/`, server code in
`backend/`.
