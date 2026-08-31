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
import type { ContainerView, Principal } from "@backend/domain/view";

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

/**
 * A container as it WOULD exist — the shape a decision is made about, rather
 * than a row that already exists. Create judges the draft being submitted;
 * edit judges both the stored row and the row the patch would produce.
 */
export interface ContainerDraft {
  type: ContainerView["type"];
  ownerId: string | null;
}

/**
 * Who may bring a container into existence — SCOPE.md §3.
 *
 * Deliberately a separate predicate from `canWrite`, and it always was: writing
 * to a container is about its CONTENTS, this is about the shape of the campaign
 * itself. Folding the two together is how the looser rule quietly grants the
 * stricter one.
 *
 * A player may add their own pack and a shared container — the two kinds whose
 * existence is theirs to decide. World containers stay the GM's alone, because
 * the reveal mechanic only means anything if players cannot mint a revealed
 * container themselves.
 */
export function canManageContainer(
  principal: Principal,
  draft: ContainerDraft,
): boolean {
  if (principal.role === "gm") return true;

  switch (draft.type) {
    // Their own, and only their own: naming someone else as owner would be
    // creating a container inside another player's sidebar.
    case "character":
      return draft.ownerId === principal.userId;
    case "party":
      return true;
    case "world":
      return false;
  }
}

/** Why this draft is refused, phrased for the person who submitted it. */
export function manageDeniedReason(
  principal: Principal,
  draft: ContainerDraft,
): string | null {
  if (canManageContainer(principal, draft)) return null;

  switch (draft.type) {
    case "character":
      return "A pack you add has to belong to you.";
    case "world":
      return "Only the GM can add a world container.";
    default:
      return "You cannot add that container.";
  }
}

export function assertCanManageContainer(
  principal: Principal,
  draft: ContainerDraft,
): void {
  if (!canManageContainer(principal, draft)) {
    throw new PermissionError(
      manageDeniedReason(principal, draft) ?? "You cannot add that container.",
    );
  }
}

/** The kinds this principal may create, in the order the dialog lists them.
 *  The form renders from this; the server checks it again on submit. */
export function creatableContainerTypes(
  principal: Principal,
): ContainerView["type"][] {
  if (principal.role === "gm") return ["character", "party", "world"];
  return ["character", "party"];
}

/**
 * Editing an existing container.
 *
 * Both ends are checked — the row as it stands and the row the patch would
 * produce — and then the kind and the owner are frozen for anyone but the GM.
 *
 * That last rule is not tidiness. Without it a player may edit the party wagon
 * (true, by the rule above) and may own a pack (also true), so converting the
 * wagon into their own pack passes both halves of a merged-state check and
 * takes the entire shared inventory private in one save. Reshaping a container
 * is the GM's call; filling one is not.
 */
export function assertCanEditContainer(
  principal: Principal,
  before: ContainerDraft,
  after: ContainerDraft,
): void {
  assertCanManageContainer(principal, before);
  assertCanManageContainer(principal, after);

  if (principal.role === "gm") return;

  if (after.type !== before.type) {
    throw new PermissionError(
      "Only the GM can change what kind of container this is.",
    );
  }
  if (after.ownerId !== before.ownerId) {
    throw new PermissionError("Only the GM can change who a container belongs to.");
  }
}

/**
 * Who may retire one — narrower than who may create one, on purpose.
 *
 * A player adds a shared container for the table; removing one is removing it
 * from everybody, so that stays with the GM. Their own pack is theirs to
 * retire. The "must be empty first" rule is enforced by the repository for
 * every role and is a separate question from this one.
 */
export function canRetireContainer(
  principal: Principal,
  container: ContainerDraft,
): boolean {
  if (principal.role === "gm") return true;
  return (
    container.type === "character" && container.ownerId === principal.userId
  );
}

export function assertCanRetireContainer(
  principal: Principal,
  container: ContainerDraft,
): void {
  if (!canRetireContainer(principal, container)) {
    throw new PermissionError(
      container.type === "character"
        ? "That pack is not yours to retire."
        : "Only the GM can retire a shared or world container.",
    );
  }
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

/* ------------------------------------------------------------------ *
 * The roster
 * ------------------------------------------------------------------ */

/**
 * Who may change the campaign's membership.
 *
 * Adding someone directly, and clearing a forgotten password, are the GM's —
 * both hand out a seat at the table, and the second is the reset path precisely
 * because there is no reset mail. Self-signup is a separate door
 * (`registerMember`) that takes no principal at all and can only ever produce a
 * player.
 */
export function canManageRoster(principal: Principal): boolean {
  return principal.role === "gm";
}

export function assertCanManageRoster(principal: Principal): void {
  if (!canManageRoster(principal)) {
    throw new PermissionError("Only the GM can change who is at this table.");
  }
}
