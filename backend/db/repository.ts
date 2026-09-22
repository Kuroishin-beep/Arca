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
  AddFromCatalogInput,
  AddMemberInput,
  CatalogItemView,
  CharacterView,
  CommentView,
  ContainerView,
  CreateCatalogItemInput,
  CreateCommentInput,
  CreateContainerInput,
  CreateItemInput,
  ItemView,
  MoveItemInput,
  Principal,
  SignUpInput,
  UpdateCatalogItemInput,
  UpdateCharacterInput,
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
 * enrolled a password yet.
 *
 * `hasPassword` is a boolean and never the hash. The hash does not leave the
 * repository — see the note on `listMembers` in each implementation.
 */
export interface Member extends Principal {
  hasPassword: boolean;
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

  /**
   * The character sheet a character container carries — SCOPE.md S1.
   *
   * `null` when the container is not a character one, so a caller never has to
   * ask twice; a PermissionError when it exists and is not theirs to read, the
   * same rule `getContainer` applies.
   *
   * A container that has never been filled in returns a DEFAULT sheet rather
   * than null. Every character container is a character — the alternative is a
   * screen that has to distinguish "no sheet" from "an empty sheet" and render
   * two different empty states for what is, at a table, one situation.
   */
  getCharacter(
    principal: Principal,
    containerId: string,
  ): Promise<CharacterView | null>;

  /**
   * Write one or more sections of a sheet.
   *
   * Gated on `canWrite` for the container, which already says exactly the right
   * thing: a player may edit their own pack and the GM may edit any. No new
   * permission rule was needed, and inventing one would have been a second
   * place for "whose character is this?" to be answered differently.
   */
  updateCharacter(
    principal: Principal,
    input: UpdateCharacterInput,
  ): Promise<CharacterView>;

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

  /* ---------------------------------------------------------------- *
   * The catalogue — SCOPE.md S3
   * ---------------------------------------------------------------- */

  /**
   * Every catalogue entry in the campaign.
   *
   * Readable by ANYONE at the table, and that is not an oversight: a
   * catalogue is a rulebook, not an inventory. It says what a hempen rope
   * weighs, never who has one. Nothing in an entry is per-container, so there
   * is nothing here for a read rule to protect.
   */
  listCatalog(principal: Principal): Promise<CatalogItemView[]>;

  getCatalogItem(
    principal: Principal,
    catalogItemId: string,
  ): Promise<CatalogItemView | null>;

  /**
   * Define something new — the GM's.
   *
   * Writing the catalogue is writing the campaign's rules, which is the same
   * kind of authority as minting a world container rather than the kind as
   * filling one. `assertCanManageCatalog`.
   */
  createCatalogItem(
    principal: Principal,
    input: CreateCatalogItemInput,
  ): Promise<CatalogItemView>;

  /**
   * Correct an entry, everywhere at once.
   *
   * This is the feature. A copy stores no name and no weight of its own, so
   * fixing them here fixes them in every pack that holds one — no fan-out
   * write, no migration, nothing to go stale, because nothing was duplicated
   * in the first place.
   */
  updateCatalogItem(
    principal: Principal,
    input: UpdateCatalogItemInput,
  ): Promise<CatalogItemView>;

  /**
   * Retire an entry. Refuses while copies of it still exist.
   *
   * The same answer `archiveContainer` gives for a container that still holds
   * items, and for the same reason: archiving it would leave every copy
   * reading from a definition no screen can reach, which is a worse outcome
   * than a refusal a GM can act on.
   */
  archiveCatalogItem(principal: Principal, catalogItemId: string): Promise<void>;

  /**
   * Take a copy into a container — the player's verb.
   *
   * Nothing leaves the catalogue, so only the DESTINATION is authorised. The
   * new object stores its own `qty` and `notes` and nothing else; every other
   * field is read through the link.
   */
  addFromCatalog(
    principal: Principal,
    input: AddFromCatalogInput,
  ): Promise<ItemView>;

  /** Everyone at the table, for the owner picker on a pack and for comment
   *  attribution. No longer feeds a sign-in picker — since M1 became email and
   *  password, nobody unauthenticated sees this list. */
  listMembers(): Promise<Member[]>;

  /**
   * Check a member's password and return them if it matches — SCOPE.md §4.
   *
   * Takes the email as typed; normalising it is this method's job, so no caller
   * can forget to and turn `Kova@…` into a member who does not exist.
   *
   * `null` covers every failure on purpose: unknown address, no password
   * enrolled, wrong password. The sign-in screen turns all of them into the
   * same message, because distinguishing them tells someone spraying addresses
   * which ones are at this table.
   */
  authenticateMember(
    email: string,
    password: string,
  ): Promise<Principal | null>;

  /**
   * First sign-in: a member with no password yet chooses one.
   *
   * Self-enrolment rather than the GM issuing credentials, because the GM
   * handing out secrets over the group chat is both a chore and the least
   * private channel the table has. It is safe precisely once — `hasPassword`
   * becomes true and this refuses from then on, so the window is "before that
   * player first signs in", not "any time".
   *
   * Returns `null` when the address is not at this table or is already
   * enrolled; the caller must not report which.
   */
  enrolMemberPassword(
    email: string,
    password: string,
  ): Promise<Principal | null>;

  /**
   * Self-signup — a stranger joins the table as a PLAYER.
   *
   * Takes no principal, because there is nobody to be yet. The role is not a
   * parameter: this method can only ever mint a player, so no caller can be
   * talked into minting a GM.
   *
   * Returns `null` when the address is already taken. That is the one place in
   * this interface where a null IS an oracle — it tells an anonymous caller
   * that an address is registered — and it is unavoidable: a sign-up form that
   * accepts a duplicate silently either hijacks an existing account or creates
   * a second one nobody can sign in to. The mitigation is that it says nothing
   * about which campaign or what role, and the throttle in
   * `backend/lib/password.ts` applies to the address either way.
   *
   * The password is chosen here rather than on first sign-in: the person is
   * present, typing, and the enrolment window this would otherwise leave open
   * is a window somebody else can walk through.
   */
  registerMember(input: SignUpInput): Promise<Principal | null>;

  /**
   * The GM adds someone directly — SCOPE.md §3.
   *
   * No password, deliberately. The member arrives unenrolled and chooses their
   * own on first sign-in, so no secret ever travels through the group chat.
   *
   * Returns `null` when the address is already taken, for the same reason as
   * above; here the caller is the GM, who is entitled to know.
   */
  addMember(principal: Principal, input: AddMemberInput): Promise<Member | null>;

  /**
   * Clear a member's password so they can choose a new one — the GM's, and the
   * whole of account recovery.
   *
   * There is no reset mail because there is no mail to send it with. Putting
   * the member back into the enrolment state they started in is the honest
   * mechanism, and it is why `users.password_hash` is nullable rather than
   * merely empty on a new row.
   */
  resetMemberPassword(principal: Principal, userId: string): Promise<void>;
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
