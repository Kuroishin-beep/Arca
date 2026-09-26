import { notFound, redirect } from "next/navigation";

import { ButtonLink } from "@frontend/components/atoms/Button";
import { Chip } from "@frontend/components/atoms/Chip";
import { Avatar } from "@frontend/components/atoms/Status";
import { WeightMeter } from "@frontend/components/molecules/WeightMeter";
import { CharacterSheet } from "@frontend/components/organisms/CharacterSheet";
import { TopBar } from "@frontend/components/organisms/TopBar";
import { repository } from "@backend/db";
import { type ItemView, itemWeight } from "@backend/domain/view";
import { PermissionError, canWrite } from "@backend/lib/permissions";
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
 * The page is a document rather than an app shell on purpose. Every other
 * screen is a list you navigate with the sidebar; this one is a thing you read
 * top to bottom and poke at, so it gets the width and the quiet.
 *
 * Reads and writes are the SAME gate — `canWrite` on the container, which
 * already says "your own pack, or anything if you are the GM". A player cannot
 * reach another player's sheet at all, because they cannot read the container
 * it hangs off.
 */
export default async function CharacterSheetPage({
  params,
}: {
  params: Promise<{ containerId: string }>;
}) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/signin");

  const { containerId } = await params;
  const repo = repository();

  let container;
  try {
    container = await repo.getContainer(principal, containerId);
  } catch (error) {
    if (error instanceof PermissionError) notFound();
    throw error;
  }
  if (!container || container.type !== "character") notFound();

  // `getCharacter` re-checks the principal itself; a null here means the
  // container exists and is not a character, which `notFound` already covered.
  const character = await repo.getCharacter(principal, containerId);
  if (!character) notFound();

  const editable = canWrite(principal, container);

  const items = await repo.listItems(principal, containerId);
  const equipment = [...items].sort((a, b) => a.name.localeCompare(b.name));

  // A real split, not a fabricated "equipped" slot Arca does not model: the
  // `types` an item carries ARE stored data, and `Weapon` is one campaigns
  // actually tag.
  const weapons = equipment.filter((item) => item.types.includes("Weapon"));
  const carried = equipment.filter((item) => !item.types.includes("Weapon"));

  return (
    <div className="flex h-screen flex-col bg-bg">
      <TopBar principal={principal} />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 p-3 md:p-6">
          {/* The page's heading, for screen readers. The visible name is an
              editable field rather than a heading — so it can be renamed in
              place — which left the page with no <h1> at all, and the
              section headings below (Attributes, Skills) with nothing to sit
              under. */}
          <h1 className="sr-only">Character sheet: {character.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href={`/c/${containerId}`} size="sm" icon="pack">
              Back to inventory
            </ButtonLink>
            <ButtonLink href="/dice" size="sm">
              diceFinder
            </ButtonLink>
            {!editable ? (
              <Chip tone="neutral">Read only</Chip>
            ) : null}
            <span className="ml-auto flex items-center gap-2">
              <Avatar name={character.name} size={28} />
            </span>
          </div>

          {/* Everything above the equipment is the sheet proper, and all of it
              is editable in place. */}
          <CharacterSheet character={character} canEdit={editable} />

          {/* Equipment is the one section that is NOT stored on the character:
              it is the containment view of the same container, which is the
              whole reason a sheet did not need its own inventory model. */}
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

            <EquipmentTable
              title="Weapons"
              subtitle="carries the Weapon type"
              items={weapons}
              emptyLabel="Nothing tagged as a weapon."
            />
            <EquipmentTable
              title="Carried"
              subtitle="everything else"
              items={carried}
              emptyLabel="Nothing else carried."
            />

            <p className="border-t border-border p-3 text-sm text-faint">
              Weight and encumbrance are derived from the containment edges at
              read time — there is no stored total to fall out of date. Items
              are added and moved from the inventory screen, which is where the
              write rules for a container live.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

function EquipmentTable({
  title,
  subtitle,
  items,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  items: ItemView[];
  emptyLabel: string;
}) {
  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-2 px-4 pt-3">
        <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-muted">
          {title}
        </h3>
        <span className="text-sm text-faint">{subtitle}</span>
        <Chip tone="neutral" className="ml-auto">
          {items.length}
        </Chip>
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
              <th
                scope="col"
                className="hidden px-3 py-2 text-sm font-medium text-muted panel:table-cell"
              >
                Tags
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2 text-sm font-medium text-muted md:table-cell"
              >
                Notes
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
                <td className="max-w-0 px-4">
                  <span className="block truncate text-text">{item.name}</span>
                </td>
                <td className="hidden px-3 panel:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <Chip key={tag}>{tag}</Chip>
                    ))}
                  </div>
                </td>
                <td className="hidden max-w-0 px-3 text-muted md:table-cell">
                  {item.notes ? (
                    <span className="block truncate">{item.notes}</span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="px-3 text-right font-mono tabular-nums text-text">
                  {item.qty}
                </td>
                <td className="px-3 text-right font-mono tabular-nums text-text">
                  {itemWeight(item).toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
