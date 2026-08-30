import { ContainerRow } from "@frontend/components/molecules/ContainerRow";
import type { ContainerType } from "@backend/domain/types";
import type { ContainerView, Principal } from "@backend/domain/view";
import { canRead, writeDeniedReason } from "@backend/lib/permissions";

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
}: {
  containers: ContainerView[];
  principal: Principal;
  selectedId?: string;
  lockedContainers?: ContainerView[];
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
    </>
  );
}
