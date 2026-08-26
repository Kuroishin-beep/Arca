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
  CreateItemInput,
  ItemView,
  MoveItemInput,
  Principal,
  UpdateItemInput,
} from "@/domain/view";

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

  listItems(principal: Principal, containerId: string): Promise<ItemView[]>;

  getItem(principal: Principal, itemId: string): Promise<ItemView | null>;

  listComments(
    principal: Principal,
    containerId: string,
  ): Promise<CommentView[]>;

  createItem(principal: Principal, input: CreateItemInput): Promise<ItemView>;

  updateItem(principal: Principal, input: UpdateItemInput): Promise<ItemView>;

  /** Soft delete. Nothing in Arca is ever hard-deleted (SCOPE.md M6). */
  archiveItem(principal: Principal, itemId: string): Promise<void>;

  /** THE operation. Authorises both ends, splits partial stacks. */
  moveItem(principal: Principal, input: MoveItemInput): Promise<MoveOutcome>;

  /** Everyone at the table, for the sign-in picker and comment attribution. */
  listMembers(): Promise<Principal[]>;
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
