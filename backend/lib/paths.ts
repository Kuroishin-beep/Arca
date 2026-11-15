/**
 * Readable URLs for containers and character sheets.
 *
 * A container's address is its name:
 *
 *   /c/packmule-honky        /character/kova
 *
 * Only when two containers in a campaign slug alike does each get the last
 * eight hex digits of its id as well (`/c/rope-6f3a91c2`), so no address is
 * ever ambiguous. Older links — full ids, and `name-<8 hex>` from the previous
 * release — still resolve (`backend/lib/container-ref.ts`) and redirect here.
 *
 * The LAST eight digits rather than the first: seeded ids differ only at the
 * end (00000000-…-000000000201), and a v4 uuid's tail is as random as its head.
 */

const SUFFIX_LENGTH = 8;

/**
 * Words → a URL segment. Unicode-aware: accents fold to their base letter
 * ("Équipement" → "equipement") and other scripts are KEPT rather than
 * deleted, so a type or container named in Japanese still gets a real slug.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** How many earlier names a container remembers, so links made before a
 *  rename keep working (`formerNames`). */
export const FORMER_NAMES_KEPT = 10;

/** The list after renaming away from `previous`: newest first, no repeats. */
export function rememberName(formerNames: readonly string[], previous: string): string[] {
  return [previous, ...formerNames.filter((n) => slugify(n) !== slugify(previous))].slice(
    0,
    FORMER_NAMES_KEPT,
  );
}

/** The id's tail, used to tell apart containers whose names slug alike. */
export function idSuffix(id: string): string {
  return id.replace(/-/g, "").slice(-SUFFIX_LENGTH).toLowerCase();
}

/**
 * Every container's URL segment, over a whole campaign: the plain name slug
 * ("seirakhan") when no other container shares it, and `slug-<8 hex>` for each
 * of the ones that do — so a duplicate name never makes two links point at
 * one place, and a unique one carries no noise.
 */
export function containerRefs(
  containers: readonly { id: string; name: string }[],
): Map<string, string> {
  const counts = new Map<string, number>();
  for (const c of containers) {
    const slug = slugify(c.name);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const c of containers) {
    const slug = slugify(c.name);
    const suffix = idSuffix(c.id);
    out.set(c.id, slug === "" ? suffix : (counts.get(slug) ?? 0) > 1 ? `${slug}-${suffix}` : slug);
  }
  return out;
}

/** The URL segment for a container: its `ref` when the repository supplied
 *  one, else its name slug (a container just created, known only by name). */
export function containerRef(container: { id: string; name: string; ref?: string }): string {
  return container.ref ?? (slugify(container.name) || idSuffix(container.id));
}

export function containerPath(container: { id: string; name: string; ref?: string }): string {
  return `/c/${containerRef(container)}`;
}

export function sheetPath(container: { id: string; name: string; ref?: string }): string {
  return `/character/${containerRef(container)}`;
}

/** A path segment as the server receives it, decoded once and safely. */
export function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    // A malformed escape (a hand-typed "%E2") is just not a ref we know.
    return raw;
  }
}

/** Whether the URL as typed is already the canonical one for this container. */
export function isCanonicalRef(
  raw: string,
  container: { id: string; name: string; ref?: string },
): boolean {
  return decodeSegment(raw) === containerRef(container);
}

/** Rebuild a query string from Next's `searchParams`, for a redirect that must
 *  keep the view (selected item, open dialog, filters) intact. */
export function queryString(params: Record<string, string | string[] | undefined>): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") out.set(key, value);
    else if (Array.isArray(value)) for (const v of value) out.append(key, v);
  }
  const qs = out.toString();
  return qs ? `?${qs}` : "";
}
