import Link from "next/link";

import { ContainerRow } from "@frontend/components/molecules/ContainerRow";
import { Icon } from "@frontend/components/atoms/Icon";
import type { ContainerType } from "@backend/domain/types";
import type { ContainerView, Principal } from "@backend/domain/view";
import {
  canRead,
  creatableContainerTypes,
  writeDeniedReason,
} from "@backend/lib/permissions";

/**
 * The container list.
 *
 * Grouped My Packs / Party / World, which is the order a player thinks in:
 * mine, ours, the world's. The grouping is not cosmetic — it is the same
 * distinction the permission rules key off.
 *
 * Pinned at `lg`. Below that it is a drawer, rendered by WorkspaceLayout.
 */
const GROUPS: { type: ContainerType; heading: string }[] = [
  { type: "character", heading: "My Packs" },
  { type: "party", heading: "Party" },
  { type: "world", heading: "World" },
];

export function Sidebar({
  containers,
  principal,
  selectedId,
  /** Containers the principal may not READ at all, shown as locked rows so the
   *  list does not silently change shape between GM and player. */
  lockedContainers = [],
  /** Where the "New container" link points. Absent on screens with no
   *  container context to return to. */
  newContainerHref,
}: {
  containers: ContainerView[];
  principal: Principal;
  selectedId?: string;
  lockedContainers?: ContainerView[];
  newContainerHref?: string;
}) {
  return (
    <>
      {GROUPS.map(({ type, heading }) => {
        const inGroup = containers.filter((c) => c.type === type);
        const lockedInGroup = lockedContainers.filter((c) => c.type === type);
        if (inGroup.length === 0 && lockedInGroup.length === 0) return null;

        // "My Packs" is only "mine" for a player. A GM sees everyone's.
        const label =
          type === "character" && principal.role === "gm" ? "Packs" : heading;

        return (
          <div key={type} className="px-3 pt-5 first:pt-4 last:pb-4">
            <h2 className="mb-2 px-2 font-serif text-sm font-bold uppercase tracking-wider text-muted">
              {label}
            </h2>
            <ul className="flex flex-col gap-1">
              {inGroup.map((container) => (
                <li key={container.id}>
                  <ContainerRow
                    container={container}
                    selected={container.id === selectedId}
                    disabledReason={
                      canRead(principal, container)
                        ? undefined
                        : (writeDeniedReason(principal, container) ?? undefined)
                    }
                  />
                </li>
              ))}
              {lockedInGroup.map((container) => (
                <li key={container.id}>
                  <ContainerRow
                    container={container}
                    disabledReason={`${container.name} is GM-only.`}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {/* Last, because creating a container is a rare, deliberate act: it sits
          below the list rather than competing with it.

          Shown to players too — a player may add their own pack or a shared
          container, just not a world one (SCOPE.md §3). The kinds they may
          pick are decided by the same predicate the server enforces, so
          somebody who may create nothing never receives this markup at all. */}
      {creatableContainerTypes(principal).length > 0 && newContainerHref ? (
        <div className="px-3 pb-4 pt-3">
          <Link
            href={newContainerHref}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-strong text-sm font-medium text-muted hover:border-primary hover:text-primary"
          >
            <Icon name="plus" size={13} />
            New container
          </Link>
        </div>
      ) : null}
    </>
  );
}
