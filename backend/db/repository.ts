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
   * Create a container — GM only (SCOPE.md §3).
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
   * Retire a container — GM only. Soft, like everything else (M6).
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

  /** Everyone at the table, for the sign-in picker and comment attribution. */
  listMembers(): Promise<Principal[]>;

  /**
   * Maps a Discord identity onto campaign membership (M1).
   *
   * `null` is a real, expected answer and not an error: it means "authenticated
   * with Discord, but not a member of this campaign", which is exactly the case
   * M1 requires to reach a "not in this campaign" screen rather than a
   * container list. Identity and authorisation are separate questions and this
   * is where they meet.
   */
  findMemberByDiscordId(discordId: string): Promise<Principal | null>;
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
