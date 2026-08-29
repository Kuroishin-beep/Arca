/**
 * Permissions — SCOPE.md §3.
 *
 * One view definition, evaluated per viewer. There is no "GM version" of a
 * query and no "player version"; there is one query and a principal.
 *
 * These functions are the application-layer check. They are NOT the only line
 * of defence: Postgres row-level security is the backstop, so a route handler
 * that forgets to call `assertCanRead` fails closed rather than leaking
 * (SCOPE.md §10 R7).
 */
import type { ContainerView, Principal } from "@/domain/view";

/**
 * A GM may open anything. A player may open their own character containers,
 * every party container, and a world container only once the GM has revealed
 * it.
 */
export function canRead(
  principal: Principal,
  container: ContainerView,
): boolean {
  if (principal.role === "gm") return true;

  switch (container.type) {
    case "character":
      return container.ownerId === principal.userId;
    case "party":
      return true;
    case "world":
      return container.revealed;
  }
}

/**
 * Write is deliberately narrower than read. A player can see the Barrow Chest
 * once it is revealed, but taking from it is still the GM's call in this
 * campaign — so world containers are GM-write regardless of reveal state.
 */
export function canWrite(
  principal: Principal,
  container: ContainerView,
): boolean {
  if (principal.role === "gm") return true;

  switch (container.type) {
    case "character":
      return container.ownerId === principal.userId;
    case "party":
      return true;
    case "world":
      return false;
  }
}

/**
 * Why a container is closed to this principal, phrased for a human. Returned to
 * the UI so a disabled row can state its reason instead of silently
 * disappearing — hiding the wagon is how you get "where did the wagon go?"
 * bug reports (SCOPE.md §8.1 step 2).
 */
export function writeDeniedReason(
  principal: Principal,
  container: ContainerView,
): string | null {
  if (canWrite(principal, container)) return null;

  switch (container.type) {
    case "character":
      return `${container.name} belongs to another player.`;
    case "world":
      return `${container.name} is GM-only.`;
    default:
      return `You cannot edit ${container.name}.`;
  }
}

/** Thrown by the assertions below; mapped to a 403 by the callers. */
export class PermissionError extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export function assertCanRead(
  principal: Principal,
  container: ContainerView,
): void {
  if (!canRead(principal, container)) {
    // Deliberately vague: naming what is inside a container the caller may not
    // read is itself a leak.
    throw new PermissionError("That container is not yours to open.");
  }
}

export function assertCanWrite(
  principal: Principal,
  container: ContainerView,
): void {
  if (!canWrite(principal, container)) {
    throw new PermissionError(
      writeDeniedReason(principal, container) ?? "You cannot edit that.",
    );
  }
}

/**
 * A move is permitted only if the actor may write to BOTH ends. Checking one
 * side is the classic way to let a player launder an item out of a container
 * they cannot touch, and it is checked on the server on every move, never only
 * in the dialog (SCOPE.md §3).
 */
export function assertCanMove(
  principal: Principal,
  from: ContainerView,
  to: ContainerView,
): void {
  assertCanWrite(principal, from);
  assertCanWrite(principal, to);
}

/** The containers this principal may see, in sidebar order. */
export function visibleContainers(
  principal: Principal,
  containers: readonly ContainerView[],
): ContainerView[] {
  const order: Record<ContainerView["type"], number> = {
    character: 0,
    party: 1,
    world: 2,
  };
  return containers
    .filter((c) => canRead(principal, c))
    .sort(
      (a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name),
    );
}
