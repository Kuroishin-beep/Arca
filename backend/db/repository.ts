/**
 * The repository boundary.
 *
 * One interface, two implementations:
 *
 *   - `fixtures`  — in-memory, the default. `npm run dev` works with no
 *                   database, which is how the UI gets built before the
 *                   Postgres foundation is provisioned.
 *   - `postgres`  — the real object graph, selected automatically as soon as
 *                   DATABASE_URL is set.
 *
 * Nothing above this line knows which one it is talking to. That is the same
 * boundary SCOPE.md §10 R1 asks for around realtime, applied to storage.
 */
import type {
  CommentView,
  ContainerView,
  CreateCommentInput,
  CreateContainerInput,
  CreateItemInput,
  ItemView,
  MoveItemInput,
  Principal,
  UpdateContainerInput,
  UpdateItemInput,
} from "@backend/domain/view";

/** What a completed move did, so the caller can describe it accurately. */
export interface MoveOutcome {
  movedQty: number;
  /** True when only part of a stack moved and the source kept the remainder. */
  split: boolean;
  fromContainerId: string;
  toContainerId: string;
  itemName: string;
}

/**
 * A member as every screen needs them: the principal, plus whether they have
 * enrolled a PIN yet.
 *
 * `hasPin` is on the roster rather than fetched per member because the sign-in
 * screen has to decide, for each name in the list, whether it is asking for a
 * PIN or offering to set one — and doing that with a query per row is a query
 * per row on the one screen that runs before anyone is authenticated.
 *
 * It is a boolean and never the hash. The hash does not leave the repository.
 */
export interface Member extends Principal {
  hasPin: boolean;
}

export interface ArcaRepository {
  /** Every container this principal may READ, in sidebar order. */
  listContainers(principal: Principal): Promise<ContainerView[]>;

  /** `null` rather than a throw when the id does not exist at all; a
   *  PermissionError when it exists but is not theirs. */
  getContainer(
    principal: Principal,
    containerId: string,
  ): Promise<ContainerView | null>;

  /**
   * Create a container — SCOPE.md §3.
   *
   * A player may add their own pack or a shared container; world containers
   * are the GM's. See `canManageContainer`.
   *
   * A container IS an object (§5.2), so this inserts into `objects` and
   * `containers` together; capacity is a property on that object, exactly as
   * an item's weight is. Nothing here is a special case.
   */
  createContainer(
    principal: Principal,
    input: CreateContainerInput,
  ): Promise<ContainerView>;

  /**
   * Edit a container. Rename, set or clear capacity, and reveal.
   *
   * Renaming and re-capacitating follow the same rule as creating. Changing
   * the KIND or the OWNER is the GM's alone — see `assertCanEditContainer`.
   *
   * Revealing is the one that matters at a table: a world container is hidden
   * until the party finds it, and this is what makes that a click rather than
   * a hand-written UPDATE. `revealed` is ignored for character and party
   * containers, which are never hidden in the first place.
   */
  updateContainer(
    principal: Principal,
    input: UpdateContainerInput,
  ): Promise<ContainerView>;

  /**
   * Retire a container. Soft, like everything else (M6).
   *
   * Narrower than creating: a player may retire their own pack, never a
   * shared or world container.
   *
   * Refuses a container that still holds items. Archiving it would hide the
   * container from every query while leaving the containment edges intact, so
   * the items inside would exist, belong somewhere, and appear nowhere — the
   * closest thing to losing loot that a soft delete can manage.
   */
  archiveContainer(principal: Principal, containerId: string): Promise<void>;

  listItems(principal: Principal, containerId: string): Promise<ItemView[]>;

  getItem(principal: Principal, itemId: string): Promise<ItemView | null>;

  listComments(
    principal: Principal,
    containerId: string,
  ): Promise<CommentView[]>;

  /**
   * Post to a container's thread (M12).
   *
   * Gated on READ, not write. A revealed world container is read-only to
   * players, and "there was a rune on the lid" is exactly the sort of thing a
   * player needs to be able to say about a chest they cannot open. Commenting
   * changes no inventory, so the write gate would buy nothing and cost the
   * feature its point.
   */
  createComment(
    principal: Principal,
    input: CreateCommentInput,
  ): Promise<CommentView>;

  createItem(principal: Principal, input: CreateItemInput): Promise<ItemView>;

  updateItem(principal: Principal, input: UpdateItemInput): Promise<ItemView>;

  /** Soft delete. Nothing in Arca is ever hard-deleted (SCOPE.md M6). */
  archiveItem(principal: Principal, itemId: string): Promise<void>;

  /** THE operation. Authorises both ends, splits partial stacks. */
  moveItem(principal: Principal, input: MoveItemInput): Promise<MoveOutcome>;

  /** Everyone at the table, for the sign-in picker, the owner picker on a
   *  pack, and comment attribution. */
  listMembers(): Promise<Member[]>;

  /**
   * Check a member's PIN and return them if it matches — SCOPE.md §4.
   *
   * `null` covers every failure on purpose: unknown member, no PIN enrolled,
   * wrong PIN. The sign-in screen turns all of them into the same message,
   * because distinguishing them tells someone probing the roster which half of
   * the pair they got right.
   */
  authenticateMember(userId: string, pin: string): Promise<Principal | null>;

  /**
   * First sign-in: a member with no PIN yet chooses one.
   *
   * Self-enrolment rather than the GM issuing PINs, because the GM handing out
   * secrets over the group chat is both a chore and the least private channel the
   * table has. It is safe precisely once — `hasPin` becomes true and this
   * refuses from then on, so the window is "before that player first signs
   * in", not "any time".
   *
   * Returns `null` when the member is unknown or already enrolled; the caller
   * must not report which.
   */
  enrolMemberPin(userId: string, pin: string): Promise<Principal | null>;
}

/** Raised when an id simply is not there. Distinct from PermissionError, which
 *  means "it exists and is not yours" — conflating them makes a 404 into an
 *  existence oracle. */
export class NotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Raised when two people act on the same stack at once (SCOPE.md §8.1). */
export class ConflictError extends Error {
  readonly code = "CONFLICT" as const;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export type RepositoryKind = "fixtures" | "postgres";

export function repositoryKind(): RepositoryKind {
  return process.env.DATABASE_URL ? "postgres" : "fixtures";
}
