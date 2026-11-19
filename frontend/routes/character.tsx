import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { RollButton } from "@frontend/components/atoms/RollButton";
import { Chip } from "@frontend/components/atoms/Chip";
import { WeightMeter } from "@frontend/components/molecules/WeightMeter";
import {
  CharacterSheet,
  type SheetTab,
} from "@frontend/components/organisms/CharacterSheet";
import { Icon, type IconName } from "@frontend/components/atoms/Icon";
import { WorkspaceShell } from "@frontend/components/organisms/WorkspaceShell";
import { repository } from "@backend/db";
import { resolveContainerId } from "@backend/lib/container-ref";
import {
  containerPath,
  isCanonicalRef,
  queryString,
  sheetPath,
} from "@backend/lib/paths";
import { CAMPAIGN_NAME } from "@backend/db/seed-data";
import { listDatabases } from "@backend/domain/database";
import { type Purse, TINY_TAG, inventoryBreakdown } from "@backend/domain/inventory";
import { damageBonus } from "@backend/domain/character";
import { weaponDamageBonus } from "@backend/domain/checks";
import {
  type ItemView,
  itemWeight,
  formatWeight,
} from "@backend/domain/view";
import {
  PermissionError,
  canCreateItem,
  canWrite,
  creatableContainerTypes,
} from "@backend/lib/permissions";
import { currentPrincipal } from "@backend/lib/session";

/**
 * Character sheet — SCOPE.md §6.2 S1.
 *
 * The stretch item the object-graph model was built for, and the argument for
 * it holds up: a character sheet is an Object carrying a property set, and its
 * equipment is a containment view of that same object. Nothing here needed a
 * new table, and the attributes below are stored by exactly the machinery that
 * stores an item's weight.
 *
 * It opens inside the same shell as a container, sidebar and all, so the sheet
 * is one more place in the campaign rather than a full-screen detour you have
 * to back out of.
 *
 * Reads and writes are the SAME gate — `canWrite` on the container, which
 * already says "your own pack, or anything if you are the GM". A player cannot
 * reach another player's sheet at all, because they cannot read the container
 * it hangs off.
 */
/** The tab reads "Kova · Arca" rather than one more "Arca". */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ containerId: string }>;
}): Promise<Metadata> {
  const fallback: Metadata = { title: "Character sheet" };
  const principal = await currentPrincipal();
  if (!principal) return fallback;
  const repo = repository();
  const containerId = await resolveContainerId(repo, principal, (await params).containerId);
  if (!containerId) return fallback;
  try {
    const container = await repo.getContainer(principal, containerId);
    return container?.type === "character" ? { title: container.name } : fallback;
  } catch (error) {
    // A sheet the viewer cannot read keeps the generic title; the page itself
    // answers with notFound. Anything else is a real failure.
    if (error instanceof PermissionError) return fallback;
    throw error;
  }
}

export default async function CharacterSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ containerId: string }>;
  searchParams: Promise<{ nav?: string; rail?: string; tab?: string }>;
}) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/signin");

  const { containerId: ref } = await params;
  const sp = await searchParams;
  const repo = repository();

  // A readable ref (`kova-00000201`) or a legacy bare id — `backend/lib/paths.ts`.
  const containerId = await resolveContainerId(repo, principal, ref);
  if (!containerId) notFound();

  let container;
  try {
    container = await repo.getContainer(principal, containerId);
  } catch (error) {
    if (error instanceof PermissionError) notFound();
    throw error;
  }
  if (!container || container.type !== "character") notFound();

  // Old id links and renamed characters land on the current address — after
  // the read check, so nobody learns a sheet's name by guessing its id.
  if (!isCanonicalRef(ref, container)) {
    redirect(encodeURI(sheetPath(container)) + queryString(sp));
  }
  /** The inventory this sheet's equipment lives in. */
  const inventoryPath = containerPath(container);

  // `getCharacter` re-checks the principal itself; a null here means the
  // container exists and is not a character, which `notFound` already covered.
  const character = await repo.getCharacter(principal, containerId);
  if (!character) notFound();

  const editable = canWrite(principal, container);

  const [items, containers, databases] = await Promise.all([
    repo.listItems(principal, containerId),
    repo.listContainers(principal),
    listDatabases(repo, principal),
  ]);
  const here = sheetPath(container);
  const railCollapsed = sp.rail === "0";
  const tab: SheetTab = SHEET_TABS.some((t) => t.key === sp.tab) ? (sp.tab as SheetTab) : "sheet";
  const writable = containers.find((c) => canWrite(principal, c));
  const shell = {
    principal,
    containers,
    databases,
    campaignName: principal.campaignName ?? CAMPAIGN_NAME,
    selectedId: containerId,
    newContainerHref:
      writable && creatableContainerTypes(principal).length > 0
        ? `${containerPath(writable)}?dialog=new-container`
        : undefined,
    newDatabaseHref:
      writable && canCreateItem(principal) ? `${containerPath(writable)}?dialog=add` : undefined,
    navOpen: sp.nav === "1",
    drawerHref: `${here}?nav=1`,
    railCollapsed,
    railHref: railCollapsed ? here : `${here}?rail=0`,
    closeHref: here,
  };

  const equipment = [...items].sort((a, b) => a.name.localeCompare(b.name));

  // The printed sheet's boxes — weapons at hand, worn armour, tiny items, and
  // the slotted inventory — split by the rule in `backend/domain/inventory.ts`.
  const inventory = inventoryBreakdown(
    equipment,
    character.sheet.attributes.STR,
    character.sheet.protection,
  );

  return (
    <WorkspaceShell {...shell}>
      {/* `relative` makes this pane the containing block for every sr-only
          span on the sheet (pips, steppers, marks). Without it their absolute
          boxes hung off the document and the page scrolled into blank space
          below the shell — ~1400px of it on a phone. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[120rem] flex-col gap-4 p-3 md:p-6">
          {/* The page's heading, for screen readers. The visible name is an
              editable field rather than a heading — so it can be renamed in
              place — which left the page with no <h1> at all, and the
              section headings below (Attributes, Skills) with nothing to sit
              under. */}
          <h1 className="sr-only">Character sheet: {character.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <SheetTabs here={here} inventoryPath={inventoryPath} tab={tab} rail={railCollapsed} />
            {!editable ? (
              <Chip tone="neutral">Read only</Chip>
            ) : null}
          </div>

          {/* Everything above the equipment is the sheet proper, and all of it
              is editable in place. */}
          <CharacterSheet
            character={character}
            canEdit={editable}
            tab={tab}
            packItems={[...new Set(equipment.map((item) => item.name))]}
          />

          {/* Equipment is the one section that is NOT stored on the character:
              it is the containment view of the same container, which is the
              whole reason a sheet did not need its own inventory model. */}
          {tab === "sheet" ? (
          <section className="rounded-lg border border-border bg-surface">
            <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
              <h2 className="font-serif text-lg font-bold text-text">
                Equipment
              </h2>
              <Chip tone="neutral">
                {container.itemCount}{" "}
                {container.itemCount === 1 ? "item" : "items"}
              </Chip>
              <div className="ml-auto min-w-[12rem] max-w-xs flex-1">
                <WeightMeter
                  carried={container.carriedWeight}
                  capacity={container.capacity}
                  label="Carried"
                />
              </div>
            </div>

            <WeaponsAtHand
              items={inventory.weapons}
              inventoryPath={inventoryPath}
              bonuses={{
                STR: damageBonus(character.sheet.attributes.STR),
                AGL: damageBonus(character.sheet.attributes.AGL),
              }}
            />
            <EquipmentTable
              title="Inventory"
              subtitle="one slot per row · half STR, rounded up"
              items={inventory.carried}
              inventoryPath={inventoryPath}
              emptyLabel="Nothing in the pack."
              count={
                <Chip
                  tone={inventory.over ? "danger" : inventory.used === inventory.slots ? "warning" : "neutral"}
                  className="ml-auto"
                >
                  <span className="font-mono tabular-nums">
                    {inventory.used} / {inventory.slots}
                  </span>{" "}
                  slots{inventory.over ? " — over" : ""}
                </Chip>
              }
            />
            {inventory.worn.length > 0 ? (
              <EquipmentTable
                title="Worn"
                subtitle="the armour and helmet on the sheet · no slot"
                items={inventory.worn}
                inventoryPath={inventoryPath}
                emptyLabel=""
              />
            ) : null}
            <TinyItems items={inventory.tiny} inventoryPath={inventoryPath} />
            <Money purse={inventory.purse} coins={inventory.coins.length} />

            <p className="border-t border-border p-3 text-sm text-muted">
              Add, move or split items from the{" "}
              <Link
                href={inventoryPath}
                className="text-primary underline underline-offset-2"
              >
                inventory
              </Link>
              . Carried weight updates on its own.
            </p>
          </section>
          ) : null}
        </div>
      </div>
    </WorkspaceShell>
  );
}

function EquipmentTable({
  title,
  subtitle,
  items,
  emptyLabel,
  inventoryPath,
  count,
}: {
  title: string;
  subtitle: string;
  items: ItemView[];
  emptyLabel: string;
  inventoryPath: string;
  /** Replaces the plain row count in the header (the inventory's slot meter). */
  count?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-2 px-4 pt-3">
        <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-muted">
          {title}
        </h3>
        <span className="text-sm text-faint">{subtitle}</span>
        {count ?? (
          <Chip tone="neutral" className="ml-auto">
            {items.length}
          </Chip>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-3 text-base text-muted">{emptyLabel}</p>
      ) : (
        <table className="mt-2 w-full text-base">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-4 py-2 text-sm font-medium text-muted">
                Item
              </th>
              {/* What an item DOES (its Effect), or the player's own note —
                  more use at the table than its tags, and the tags took the
                  width the names needed. */}
              <th
                scope="col"
                className="hidden px-3 py-2 text-sm font-medium text-muted md:table-cell"
              >
                Effect / notes
              </th>
              <th
                scope="col"
                className="w-14 px-3 py-2 text-right text-sm font-medium text-muted"
              >
                Qty
              </th>
              <th
                scope="col"
                className="w-20 px-3 py-2 text-right text-sm font-medium text-muted"
              >
                Wt
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="h-9 border-b border-border last:border-0 hover:bg-surface2"
              >
                <td className="min-w-36 max-w-0 px-4 py-1">
                  {/* Two lines before truncating, so "Currency, Gold Piece"
                      and "Rope, Hemp (10 meters)" read in a narrow panel. */}
                  <Link
                    href={`${inventoryPath}?item=${item.id}`}
                    title={item.name}
                    className="line-clamp-2 text-text hover:text-primary hover:underline"
                  >
                    {item.name}
                  </Link>
                </td>
                <td className="hidden max-w-0 px-3 text-muted md:table-cell">
                  {item.stats.effect?.trim() || item.notes.trim() ? (
                    <span className="block truncate" title={item.stats.effect || item.notes}>
                      {item.stats.effect?.trim() || item.notes}
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="px-3 text-right font-mono tabular-nums text-text">
                  {item.qty}
                </td>
                <td className="px-3 text-right font-mono tabular-nums text-text">
                  {formatWeight(itemWeight(item))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * The printed sheet's "Weapons at hand" box: what each weapon does, read off
 * the item's own Weapon fields (grip, STR requirement, damage, durability,
 * features) — the same values the Weapon database shows, never a copy.
 */
function WeaponsAtHand({
  items,
  inventoryPath,
  bonuses,
}: {
  items: ItemView[];
  inventoryPath: string;
  /** STR and AGL damage bonuses, added to the weapons that use them. */
  bonuses: { STR: "D4" | "D6" | null; AGL: "D4" | "D6" | null };
}) {
  const stat = (item: ItemView, key: string) =>
    item.stats[key]?.trim() ? (
      item.stats[key]
    ) : (
      <span className="text-faint">—</span>
    );

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-2 px-4 pt-3">
        <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-muted">
          Weapons at hand
        </h3>
        <span className="text-sm text-faint">tagged Weapon</span>
        <Chip tone="neutral" className="ml-auto">
          {items.length}
        </Chip>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-3 text-base text-muted">Nothing tagged as a weapon.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-base">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="px-4 py-2 text-sm font-medium text-muted">
                  Weapon
                </th>
                <th scope="col" className="px-3 py-2 text-sm font-medium text-muted">
                  Grip
                </th>
                <th scope="col" className="hidden px-3 py-2 text-sm font-medium text-muted panel:table-cell">
                  STR
                </th>
                <th scope="col" className="px-3 py-2 text-sm font-medium text-muted">
                  Damage
                </th>
                <th scope="col" className="hidden px-3 py-2 text-sm font-medium text-muted panel:table-cell">
                  Durability
                </th>
                <th scope="col" className="hidden px-3 py-2 text-sm font-medium text-muted md:table-cell">
                  Features
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="h-10 border-b border-border last:border-0 hover:bg-surface2">
                  <td className="min-w-32 max-w-0 px-4">
                    <Link
                      href={`${inventoryPath}?item=${item.id}`}
                      title={item.name}
                      className="block truncate text-text hover:text-primary hover:underline"
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-3 font-mono text-text">{stat(item, "grip")}</td>
                  <td className="hidden px-3 font-mono text-text panel:table-cell">
                    {stat(item, "str")}
                  </td>
                  <td className="px-3 font-mono text-text">
                    {(() => {
                      const damage = item.stats.damage?.trim();
                      // The STR or AGL damage bonus this weapon's skill uses,
                      // added to the roll and shown beside the dice.
                      const { bonus, attribute } = weaponDamageBonus(item.name, bonuses);
                      return (
                        <span className="inline-flex items-center gap-1">
                          {stat(item, "damage")}
                          {damage && bonus ? (
                            <span className="text-primary" title={`${attribute} damage bonus`}>
                              +{bonus}
                            </span>
                          ) : null}
                          {damage ? (
                            <RollButton
                              notation={bonus ? `${damage}+${bonus}` : damage}
                              label={`${item.name} damage${bonus ? ` (+${bonus} ${attribute})` : ""}`}
                            />
                          ) : null}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="hidden px-3 font-mono text-text panel:table-cell">
                    {stat(item, "durability")}
                  </td>
                  <td className="hidden max-w-0 px-3 text-muted md:table-cell">
                    <span className="block truncate">{stat(item, "features")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * The sheet's "Tiny items" box: things too small to take a slot. An item is
 * tiny when it carries the `tiny` tag, so moving one here is a tag edit in the
 * inventory rather than a second list to keep in step.
 */
function TinyItems({
  items,
  inventoryPath,
}: {
  items: ItemView[];
  inventoryPath: string;
}) {
  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-muted">
          Tiny items
        </h3>
        <span className="text-sm text-faint">no slot</span>
        <Chip tone="neutral" className="ml-auto">
          {items.length}
        </Chip>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-base text-muted">
          Tag an item <span className="font-mono text-text">{TINY_TAG}</span> in the
          inventory — a ring, a key, a letter — and it moves here.
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`${inventoryPath}?item=${item.id}`}
                className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface2 px-2 py-1 text-base text-text hover:text-primary"
              >
                {item.name}
                {item.qty > 1 ? (
                  <span className="font-mono text-sm tabular-nums text-muted">×{item.qty}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Coins, read from the currency items in the pack ("Currency, Gold Piece" ×2)
 * rather than typed into the sheet — so spending one in the inventory is the
 * only bookkeeping, and the two can never disagree.
 */
function Money({ purse, coins }: { purse: Purse; coins: number }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-muted">
          Money
        </h3>
        <span className="text-sm text-faint">from currency in the pack · no slot</span>
      </div>
      {coins === 0 ? (
        <p className="mt-2 text-base text-muted">
          No coins carried. Add “Currency, Gold Piece” (or Silver, Copper) from the
          catalogue and they count here.
        </p>
      ) : (
        <p className="mt-2 flex flex-wrap gap-3 font-mono text-base tabular-nums text-text">
          <span>{purse.gold} gp</span>
          <span>{purse.silver} sp</span>
          <span>{purse.copper} cp</span>
        </p>
      )}
    </div>
  );
}

const SHEET_TABS: { key: SheetTab; label: string; icon: IconName }[] = [
  { key: "sheet", label: "Sheet", icon: "users" },
  { key: "abilities", label: "Abilities", icon: "arrow-up" },
  { key: "spells", label: "Spells", icon: "eye" },
  { key: "dice", label: "Dice", icon: "d20" },
];

/**
 * The sheet's tabs: Inventory (this character's container), then the sheet's
 * own sections. Links, not client state, so a tab is an address — "open my
 * spells" is a bookmark — and each loads only what it shows.
 */
function SheetTabs({
  here,
  inventoryPath,
  tab,
  rail,
}: {
  here: string;
  inventoryPath: string;
  tab: SheetTab;
  rail: boolean;
}) {
  const href = (key: SheetTab) => {
    const p = new URLSearchParams();
    if (key !== "sheet") p.set("tab", key);
    if (rail) p.set("rail", "0");
    const qs = p.toString();
    return qs ? `${here}?${qs}` : here;
  };
  const base =
    "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium";
  return (
    <nav aria-label="Character sheet sections" className="flex flex-wrap gap-1">
      <Link href={inventoryPath} className={`${base} border-border bg-surface text-text hover:bg-surface2`}>
        <Icon name="pack" size={14} />
        Inventory
      </Link>
      {SHEET_TABS.map((t) => {
        const active = t.key === tab;
        return (
          <Link
            key={t.key}
            href={href(t.key)}
            aria-current={active ? "page" : undefined}
            className={`${base} ${
              active
                ? "border-primary bg-primary text-invert"
                : "border-border bg-surface text-text hover:bg-surface2"
            }`}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
