import { notFound, redirect } from "next/navigation";

import { ButtonLink } from "@frontend/components/atoms/Button";
import { Chip } from "@frontend/components/atoms/Chip";
import { Avatar } from "@frontend/components/atoms/Status";
import { WeightMeter } from "@frontend/components/molecules/WeightMeter";
import { TopBar } from "@frontend/components/organisms/TopBar";
import { repository } from "@backend/db";
import {
  encumbrance,
  itemWeight,
  weightPercent,
  type ItemView,
} from "@backend/domain/view";
import { PermissionError } from "@backend/lib/permissions";
import { currentPrincipal } from "@backend/lib/session";

/**
 * Character sheet — ★ STRETCH SCOPE ★ (SCOPE.md §6.2, S1).
 *
 * Not a new subsystem, which is the whole argument for keeping the object-graph
 * model: a character sheet is an Object carrying a `Character` type, and its
 * equipment is a containment view of that character's own container — the same
 * data the Workspace renders, at a narrower width.
 *
 * What IS real here: the equipment list, its weights, and the encumbrance
 * meter, all read through the same repository and derived the same way.
 *
 * What is NOT yet persisted: attributes, skills and spells. Those are property
 * values on a `Character` object, and seeding them is part of S1 rather than
 * something to fake convincingly here. They are labelled as such on the page
 * instead of being rendered as though the data were real.
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

  const items = await repo.listItems(principal, containerId);
  const equipment = [...items].sort((a, b) => a.name.localeCompare(b.name));

  // A real split, not a fabricated "equipped" slot Arca does not model: the
  // `types` an item carries ARE stored data, and `Weapon` is one campaigns
  // actually tag. Grouping on it separates "what you'd draw" from "what you're
  // hauling" without inventing a field this schema does not have.
  const weapons = equipment.filter((item) => item.types.includes("Weapon"));
  const carried = equipment.filter((item) => !item.types.includes("Weapon"));

  const state = encumbrance(container.carriedWeight, container.capacity);
  const percent = weightPercent(container.carriedWeight, container.capacity);
  const STATE_TEXT = {
    ok: "text-text",
    "at-limit": "text-warning",
    over: "text-danger",
  } as const;

  return (
    <div className="flex h-screen flex-col bg-bg">
      <TopBar principal={principal} />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="warning">Stretch scope</Chip>
            <ButtonLink href={`/c/${containerId}`} size="sm">
              Open in inventory
            </ButtonLink>
            <ButtonLink href="/dice" size="sm">
              diceFinder
            </ButtonLink>
          </div>

          <section className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-surface p-4">
            <Avatar name={container.name} size={56} />
            <div className="min-w-0 flex-1">
              <h1 className="font-serif text-xl font-bold text-text">
                {container.name}
              </h1>
              <p className="mt-1 text-base text-muted">
                {container.itemCount} items carried
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Chip>Character</Chip>
                <Chip>Player Character</Chip>
              </div>
            </div>
          </section>

          {/* Three real numbers, in the big-number-card shape a stat block
              uses — but every value here is one this schema actually stores
              or derives, never a placeholder standing in for one it doesn't. */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Items carried" value={String(container.itemCount)} />
            <StatCard
              label="Weight"
              value={
                container.capacity === null
                  ? `${container.carriedWeight.toFixed(1)} kg`
                  : `${container.carriedWeight.toFixed(1)}/${container.capacity.toFixed(1)}`
              }
              unit={container.capacity === null ? undefined : "kg"}
              tone={STATE_TEXT[state]}
            />
            <StatCard
              label="Encumbrance"
              value={container.capacity === null ? "—" : `${percent}%`}
              tone={STATE_TEXT[state]}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            <div className="flex flex-col gap-5">
              {/* Real, and derived — the same meter the workspace footer uses. */}
              <section className="rounded-lg border border-border bg-surface p-4">
                <h2 className="mb-3 font-serif text-lg font-bold text-text">
                  Encumbrance
                </h2>
                <WeightMeter
                  carried={container.carriedWeight}
                  capacity={container.capacity}
                  label="Carried"
                />
                <p className="mt-3 border-t border-border pt-3 text-sm text-faint">
                  Derived from the containment edges at read time. There is no
                  stored total to fall out of date.
                </p>
              </section>

              <section className="rounded-lg border border-border bg-surface p-4">
                <h2 className="mb-2 font-serif text-lg font-bold text-text">
                  Attributes
                </h2>
                <p className="text-base text-muted">
                  STR, CON, AGL, INT, WIL and CHA are property values on a{" "}
                  <span className="font-mono text-sm text-text">Character</span>{" "}
                  object.
                </p>
                <p className="mt-2 text-sm text-faint">
                  Not seeded yet — this is S1 work, and showing invented numbers
                  here would be worse than showing none.
                </p>
              </section>
            </div>

            <div className="flex min-w-0 flex-col gap-5">
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
              <p className="-mt-2 text-sm text-faint">
                Split on the <span className="font-mono">Weapon</span> type an
                item actually carries — not on a slot (&ldquo;main
                hand&rdquo;, &ldquo;belt&rdquo;) Arca has no field for. The axe
                is one object whether it is on a belt or in the wagon.
              </p>

              <section className="rounded-lg border border-border bg-surface p-4">
                <h2 className="mb-3 font-serif text-lg font-bold text-text">
                  Skills &amp; spells
                </h2>
                <div className="rounded-md border border-border p-6 text-center">
                  <p className="text-base text-muted">
                    Rendered from the property sets of the types an object
                    carries.
                  </p>
                  <p className="mt-2 text-sm text-faint">
                    A spells section appears only when the object carries a{" "}
                    <span className="font-mono">Spellcaster</span> type — which
                    is why this is additive rather than a rewrite.
                  </p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  tone = "text-text",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-faint">
        {label}
      </p>
      <p className={`mt-1 font-serif text-2xl font-bold ${tone}`}>
        {value}
        {unit ? (
          <span className="ml-1 text-sm font-normal text-muted">{unit}</span>
        ) : null}
      </p>
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
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <h2 className="font-serif text-lg font-bold text-text">{title}</h2>
        <span className="text-sm text-faint">{subtitle}</span>
        <Chip tone="neutral" className="ml-auto">
          {items.length}
        </Chip>
      </div>

      {items.length === 0 ? (
        <p className="p-4 text-base text-muted">{emptyLabel}</p>
      ) : (
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-4 py-2 text-sm font-medium text-muted">
                Item
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2 text-sm font-medium text-muted sm:table-cell"
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
                <td className="hidden px-3 sm:table-cell">
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
    </section>
  );
}
