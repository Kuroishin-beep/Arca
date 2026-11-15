import type { ArcaRepository } from "@backend/db/repository";
import type { Principal } from "@backend/domain/view";
import { containerRefs, decodeSegment, idSuffix, slugify } from "@backend/lib/paths";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A `/c/[ref]` or `/character/[ref]` segment → the container id it names, or
 * `null` when it names nothing (or more than one thing).
 *
 * Tried in order: a full id (links from before readable URLs); the current
 * address (`seirakhan`, or `seirakhan-98500fb5` for a shared name); a name the
 * container had before a rename; then any `<words>-<8 hex>` whose hex is a
 * container's id tail — the readable links of the previous release.
 *
 * Permission is NOT checked here; the page's `getContainer` does that, exactly
 * as it did when the URL carried the raw id.
 */
export async function resolveContainerId(
  repo: ArcaRepository,
  principal: Principal,
  raw: string,
): Promise<string | null> {
  const ref = decodeSegment(raw).trim().toLowerCase();
  if (UUID.test(ref)) return ref;

  const all = await repo.listContainerNames(principal);
  const refs = containerRefs(all);
  const exact = all.filter((c) => refs.get(c.id) === ref);
  if (exact.length === 1) return exact[0]?.id ?? null;

  // A name it had before a rename — links made then still work.
  const renamed = all.filter((c) => (c.formerNames ?? []).some((n) => slugify(n) === ref));
  if (exact.length === 0 && renamed.length === 1) return renamed[0]?.id ?? null;

  const tail = /(?:^|-)([0-9a-f]{8})$/.exec(ref)?.[1];
  if (!tail) return null;
  const bySuffix = all.filter((c) => idSuffix(c.id) === tail);
  return bySuffix.length === 1 ? (bySuffix[0]?.id ?? null) : null;
}

/**
 * The message to show when `name` would give a container the same address as
 * another one in this campaign, or `null` when it is free. Checked when a
 * container is created or renamed, so addresses stay plain names: a clash
 * would otherwise force the id tail onto both.
 */
export async function nameClash(
  repo: ArcaRepository,
  principal: Principal,
  name: string,
  exceptId?: string,
): Promise<string | null> {
  const wanted = slugify(name);
  if (wanted === "") return null;
  const all = await repo.listContainerNames(principal);
  const other = all.find((c) => c.id !== exceptId && slugify(c.name) === wanted);
  return other ? `“${other.name}” already has that name. Pick another.` : null;
}

/** A container's address as it stands NOW — after a create or rename, so the
 *  page can move to it instead of sitting on an address that no longer
 *  resolves. */
export async function currentRef(
  repo: ArcaRepository,
  principal: Principal,
  containerId: string,
): Promise<string> {
  return containerRefs(await repo.listContainerNames(principal)).get(containerId) ?? containerId;
}
