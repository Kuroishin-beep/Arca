/**
 * Readable URLs for containers and character sheets.
 *
 * A container's address is its name plus the last eight hex digits of its id:
 *
 *   /c/packmule-honky-6f3a91c2        /character/kova-00000201
 *
 * The name is for people; the id suffix is what the server actually looks the
 * container up by (`resolveContainerRef`). So renaming a container, or two
 * containers sharing a name, never breaks a link — a stale name in the URL is
 * simply redirected to the current one. The full-uuid URLs every earlier
 * version produced still resolve and redirect too.
 *
 * The LAST eight digits rather than the first: seeded ids differ only at the
 * end (00000000-…-000000000201), and a v4 uuid's tail is as random as its head.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

function idSuffix(id: string): string {
  return id.replace(/-/g, "").slice(-SUFFIX_LENGTH).toLowerCase();
}

/** The URL segment for a container: `name-slug-<8 hex>`, or just the hex. */
export function containerRef(container: { id: string; name: string }): string {
  const words = slugify(container.name);
  const suffix = idSuffix(container.id);
  return words ? `${words}-${suffix}` : suffix;
}

export function containerPath(container: { id: string; name: string }): string {
  return `/c/${containerRef(container)}`;
}

export function sheetPath(container: { id: string; name: string }): string {
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

/** What a `/c/[ref]` segment names: a full id, or an id suffix to look up. */
export type ParsedRef = { id: string } | { suffix: string };

export function parseContainerRef(raw: string): ParsedRef | null {
  const ref = decodeSegment(raw).trim().toLowerCase();
  if (UUID.test(ref)) return { id: ref };
  const match = /(?:^|-)([0-9a-f]{8})$/.exec(ref);
  return match?.[1] ? { suffix: match[1] } : null;
}

/** Whether the URL as typed is already the canonical one for this container. */
export function isCanonicalRef(raw: string, container: { id: string; name: string }): boolean {
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
