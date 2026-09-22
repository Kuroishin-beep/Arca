"use client";

import Link from "next/link";

import { sharedFields } from "@backend/domain/item-fields";

import { Chip } from "@frontend/components/atoms/Chip";
import { Icon } from "@frontend/components/atoms/Icon";
import { EmptyState } from "@frontend/components/molecules/EmptyState";
import { ButtonLink } from "@frontend/components/atoms/Button";
import {
  applyPending,
  useOptimisticItems,
} from "@frontend/components/organisms/OptimisticItems";
import {
  type ItemView,
  type Sort,
  type SortColumn,
  itemWeight,
} from "@backend/domain/view";

/**
 * The item table.
 *
 * A real `<table>`, because it is real tabular data — a grid of divs would lose
 * row/column association for anyone using a screen reader, and this is the
 * screen they would most need it on.
 *
 * Sort state is announced with `aria-sort` on the `<th>`, not just an arrow
 * glyph. Below the `panel` breakpoint the table STOPS BEING A TABLE and becomes
 * stacked rows — squeezing six columns into 340px is how you end up with a
 * sideways scrollbar, and there must never be one at 375px.
 */
export function ItemTable({
  items: serverItems,
  containerId,
  sort,
  selectedId,
  canEdit,
  canCreate,
  query,
}: {
  items: ItemView[];
  containerId: string;
  sort: Sort;
  selectedId?: string;
  canEdit: boolean;
  /** Typing an item in from scratch is the GM's (`canCreateItem`); a player
   *  who can write here fills it from the catalogue instead. */
  canCreate: boolean;
  query: string;
}) {
  // A move or an archive in flight is reflected here before the server answers
  // (SCOPE.md §8.1 step 4). If it is rejected, the transition ends, the
  // optimistic entry is dropped, and the row returns on its own — see
  // OptimisticItems.tsx for why that revert is the API's job and not ours.
  const { pending } = useOptimisticItems();
  const items = applyPending(serverItems, pending);
  // The reference diagram's rule: a container shows only the columns every
  // item in it shares. All weapons → the weapon columns; a dagger beside a
  // sleeping fur → just the common ones.
  const extra = sharedFields(items);

  if (items.length === 0) {
    return query.trim() !== "" ? (
      <EmptyState
        icon="search"
        title={`No match for “${query.trim()}”`}
        body="Nothing here matches, including item tags and types."
        action={
          <ButtonLink href={`/c/${containerId}`} variant="secondary" size="sm">
            Clear search
          </ButtonLink>
        }
      />
    ) : (
      <EmptyState
        title="Nothing stowed here"
        body="This container is empty. Add an item from the catalogue, or move one in from another container."
        action={
          canCreate ? (
            <ButtonLink
              href={`/c/${containerId}?dialog=add`}
              variant="primary"
              size="sm"
              icon="plus"
            >
              Add item
            </ButtonLink>
          ) : canEdit ? (
            <ButtonLink
              href={`/c/${containerId}?dialog=catalog`}
              variant="primary"
              size="sm"
              icon="table"
            >
              From catalogue
            </ButtonLink>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {/* ── Below `panel`: stacked two-line rows ───────────────────── */}
      <ul className="panel:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={rowHref(containerId, item.id, query)}
              className={`block border-b border-border px-3 py-2 ${
                item.id === selectedId ? "bg-surface2" : ""
              }`}
            >
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-base text-text">
                  {item.name}
                </span>
                <span className="shrink-0 font-mono text-base tabular-nums text-text">
                  ×{item.qty}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                <span className="font-mono tabular-nums">
                  {itemWeight(item).toFixed(1)} kg
                </span>
                {item.value ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{item.value}</span>
                  </>
                ) : null}
                {extra.map((field) =>
                  item.stats[field.key] ? (
                    <span key={field.key} className="flex items-center gap-2">
                      <span aria-hidden="true">·</span>
                      <span className="truncate">
                        <span className="text-faint">{field.short}</span>{" "}
                        <span className="font-mono">{item.stats[field.key]}</span>
                      </span>
                    </span>
                  ) : null,
                )}
                {extra.length === 0 && item.tags[0] ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{item.tags[0]}</span>
                  </>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* ── `panel` and up: the table proper ───────────────────────── */}
      <table className="hidden w-full text-base panel:table">
        <thead className="sticky top-0 z-10 bg-bg">
          <tr className="border-b border-border text-left">
            <SortableHeader
              column="name"
              label="Name"
              sort={sort}
              containerId={containerId}
              query={query}
              className="px-3 md:px-4"
            />
            <SortableHeader
              column="qty"
              label="Qty"
              sort={sort}
              containerId={containerId}
              query={query}
              numeric
              className="w-16 px-3"
            />
            <SortableHeader
              column="weight"
              label="Wt"
              sort={sort}
              containerId={containerId}
              query={query}
              numeric
              className="w-20 px-3"
            />
            <SortableHeader
              column="value"
              label="Value"
              sort={sort}
              containerId={containerId}
              query={query}
              numeric
              className="hidden w-20 px-3 md:table-cell"
            />
            {extra.map((field) => (
              <th
                key={field.key}
                scope="col"
                title={field.label}
                className={`hidden px-3 py-2 text-sm font-medium text-muted md:table-cell ${
                  field.numeric ? "text-right" : ""
                }`}
              >
                {field.label === field.short ? (
                  field.label
                ) : (
                  <>
                    <span aria-hidden="true">{field.short}</span>
                    <span className="sr-only">{field.label}</span>
                  </>
                )}
              </th>
            ))}
            <th
              scope="col"
              className={`hidden px-3 py-2 text-sm font-medium text-muted ${
                extra.length > 0 ? "xl:table-cell" : "md:table-cell"
              }`}
            >
              Tags
            </th>
            {/* `lg` and up only (Design.md Step F): the three-pane width is
                the first one with room for the object's own notes without
                crowding the name column it sits after. */}
            <th
              scope="col"
              className={`hidden px-3 py-2 text-sm font-medium text-muted ${
                extra.length > 0 ? "xl:table-cell" : "lg:table-cell"
              }`}
            >
              Notes
            </th>
            <th scope="col" className="hidden w-10 px-2 py-2 lg:table-cell">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <tr
                key={item.id}
                aria-selected={selected}
                className={`h-9 border-b border-border ${
                  selected ? "bg-surface2" : "hover:bg-surface"
                }`}
              >
                <td className="max-w-0 px-3 md:px-4">
                  <Link
                    href={rowHref(containerId, item.id, query)}
                    className="flex items-center gap-2"
                  >
                    {selected ? (
                      <span
                        className="h-4 w-0.5 shrink-0 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    ) : null}
                    {/* The name IS the link to the item's full details (the
                        reference diagram settles it: "make the item name itself
                        a hyperlink"), so it reads as one. */}
                    <span
                      className={`truncate underline decoration-border underline-offset-4 hover:text-primary hover:decoration-primary ${
                        selected ? "font-medium text-text" : "text-text"
                      }`}
                    >
                      {item.name}
                    </span>
                  </Link>
                </td>
                <td className="px-3 text-right font-mono text-base tabular-nums text-text">
                  {item.qty}
                </td>
                <td className="px-3 text-right font-mono text-base tabular-nums text-text">
                  {item.weight.toFixed(1)}
                </td>
                <td className="hidden px-3 text-right font-mono text-base tabular-nums text-muted md:table-cell">
                  {item.value || "—"}
                </td>
                {extra.map((field) => (
                  <td
                    key={field.key}
                    className={`hidden px-3 text-base text-text md:table-cell ${
                      field.numeric ? "text-right font-mono tabular-nums" : ""
                    }`}
                  >
                    {item.stats[field.key] ?? (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                ))}
                <td
                  className={`hidden px-3 ${
                    extra.length > 0 ? "xl:table-cell" : "md:table-cell"
                  }`}
                >
                  {item.tags[0] ? (
                    <Chip tone={item.tags[0] === "consumable" ? "success" : "neutral"}>
                      {item.tags[0]}
                    </Chip>
                  ) : null}
                </td>
                <td
                  className={`hidden max-w-0 px-3 text-muted ${
                    extra.length > 0 ? "xl:table-cell" : "lg:table-cell"
                  }`}
                >
                  {item.notes ? (
                    <span className="block truncate">{item.notes}</span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="hidden px-2 text-right lg:table-cell">
                  <Link
                    href={rowHref(containerId, item.id, query)}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface3 hover:text-text"
                  >
                    <Icon name="more" size={14} />
                    <span className="sr-only">Open {item.name}</span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function rowHref(containerId: string, itemId: string, query: string): string {
  const params = new URLSearchParams({ item: itemId });
  if (query.trim() !== "") params.set("q", query);
  return `/c/${containerId}?${params.toString()}`;
}

/**
 * Sorting is a property of the VIEW, never of the data — so it lives in the URL
 * and the header is a link. That also makes a sorted table shareable and
 * survivable across a panel reload.
 */
function SortableHeader({
  column,
  label,
  sort,
  containerId,
  query,
  numeric,
  className = "",
}: {
  column: SortColumn;
  label: string;
  sort: Sort;
  containerId: string;
  query: string;
  numeric?: boolean;
  className?: string;
}) {
  const active = sort.column === column;
  const nextDirection = active && sort.direction === "asc" ? "desc" : "asc";

  const params = new URLSearchParams({ sort: column, dir: nextDirection });
  if (query.trim() !== "") params.set("q", query);

  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
      }
      className={`py-2 text-sm font-medium text-muted ${className}`}
    >
      <Link
        href={`/c/${containerId}?${params.toString()}`}
        className={`flex items-center gap-1 hover:text-text ${
          numeric ? "justify-end" : ""
        }`}
      >
        {label}
        {active ? (
          <Icon
            name={sort.direction === "asc" ? "chevron-up" : "chevron-down"}
            size={10}
            strokeWidth={2}
            className="text-primary"
          />
        ) : null}
      </Link>
    </th>
  );
}
