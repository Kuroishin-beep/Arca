import { inCampaign } from "@backend/lib/campaign";

import { fixtureRepository } from "./fixture-repository";
import { type ArcaRepository, repositoryKind } from "./repository";

/**
 * Picks the storage implementation. The Postgres module is required lazily so
 * that a machine with no DATABASE_URL never loads the driver at all — the
 * fixture path stays a pure in-memory app.
 */
export function repository(): ArcaRepository {
  if (repositoryKind() === "fixtures") return scopedRepository(fixtureRepository);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("./postgres-repository") as typeof import("./postgres-repository");
  return scopedRepository(mod.postgresRepository);
}

/**
 * Runs every call in the caller's campaign.
 *
 * Each repository method that acts for someone takes their `Principal`, and
 * the principal carries the campaign they are working in. Wrapping the call in
 * that campaign means every query inside — however deep, however many awaits
 * later — scopes itself through `campaignId()`, and no signature or query had
 * to change to make the app hold more than one campaign. Calls with no
 * principal (sign-up, sign-in) run in the deployment's default campaign, as
 * everything did before.
 */
const SCOPED = new WeakMap<ArcaRepository, ArcaRepository>();

function scopedRepository(repo: ArcaRepository): ArcaRepository {
  const cached = SCOPED.get(repo);
  if (cached) return cached;

  const wrapped = new Proxy(repo, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const principal = args.find(isScopedPrincipal);
        const call = () => (value as (...a: unknown[]) => unknown).apply(target, args);
        return principal ? inCampaign(principal.campaignId, call) : call();
      };
    },
  });
  SCOPED.set(repo, wrapped);
  return wrapped;
}

function isScopedPrincipal(arg: unknown): arg is { campaignId: string } {
  return (
    typeof arg === "object" &&
    arg !== null &&
    "userId" in arg &&
    typeof (arg as { campaignId?: unknown }).campaignId === "string"
  );
}

/**
 * Whether storage is usable, as a sentence to show rather than an exception.
 *
 * Always `null` for fixtures — an in-memory store cannot be unreachable, which
 * is the whole reason it is the no-configuration default. The Postgres module
 * stays lazily required so this does not pull the driver in on a machine with
 * no DATABASE_URL.
 */
export async function storageProblem(): Promise<string | null> {
  if (repositoryKind() === "fixtures") return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("./client") as typeof import("./client");
  return mod.storageProblem();
}

export { repositoryKind } from "./repository";
export type { ArcaRepository, Member, MoveOutcome } from "./repository";
