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

export { repositoryKind } from "./repository";
export type { ArcaRepository, Member, MoveOutcome } from "./repository";
