import type { ArcaRepository } from "@backend/db/repository";
import type { Principal } from "@backend/domain/view";
import { parseContainerRef } from "@backend/lib/paths";

/**
 * A `/c/[ref]` or `/character/[ref]` segment → the container id it names, or
 * `null` when it names nothing (unparseable, no match, or an ambiguous
 * suffix). Permission is NOT checked here; the page's `getContainer` does
 * that, exactly as it did when the URL carried the raw id.
 */
export async function resolveContainerId(
  repo: ArcaRepository,
  principal: Principal,
  raw: string,
): Promise<string | null> {
  const parsed = parseContainerRef(raw);
  if (!parsed) return null;
  if ("id" in parsed) return parsed.id;
  const ids = await repo.findContainerIdsBySuffix(principal, parsed.suffix);
  return ids.length === 1 ? (ids[0] ?? null) : null;
}
