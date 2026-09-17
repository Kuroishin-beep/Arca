import { fixtureRepository } from "./fixture-repository";
import { type ArcaRepository, repositoryKind } from "./repository";

/**
 * Picks the storage implementation. The Postgres module is required lazily so
 * that a machine with no DATABASE_URL never loads the driver at all — the
 * fixture path stays a pure in-memory app.
 */
export function repository(): ArcaRepository {
  if (repositoryKind() === "fixtures") return fixtureRepository;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("./postgres-repository") as typeof import("./postgres-repository");
  return mod.postgresRepository;
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
