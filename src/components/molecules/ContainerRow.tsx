import Link from "next/link";

import { ContainerDot, ContainerIcon } from "@/components/atoms/Chip";
import { Icon } from "@/components/atoms/Icon";
import type { ContainerView } from "@/domain/view";

/**
 * One container in the sidebar.
 *
 * A container the principal cannot open is rendered DISABLED WITH A REASON
 * rather than hidden. Hiding it is what produces "where did the wagon go?" —
 * the player knows the vault exists, and an app that pretends otherwise looks
 * broken rather than secure. (Its CONTENTS never reach the device; that is a
 * separate question, enforced in the repository.)
 */
export function ContainerRow({
  container,
  selected,
  disabledReason,
}: {
  container: ContainerView;
  selected?: boolean;
  disabledReason?: string;
}) {
  const inner = (
    <>
      <ContainerDot type={container.type} />
      <ContainerIcon
        type={container.type}
        className={`shrink-0 ${selected ? "text-c-party" : "text-muted"}`}
      />
      <span className="min-w-0 flex-1 truncate">{container.name}</span>
      <span
        className={`shrink-0 font-mono text-xs ${
          selected ? "text-muted" : "text-faint"
        }`}
      >
        {container.itemCount}
      </span>
    </>
  );

  if (disabledReason) {
    return (
      <span
        aria-disabled="true"
        title={disabledReason}
        className="flex h-11 cursor-not-allowed items-center gap-2 rounded-md px-2 text-base text-faint panel:h-9"
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-surface3"
          aria-hidden="true"
        />
        <Icon name="lock" size={15} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{container.name}</span>
        <span className="shrink-0 text-xs">GM</span>
      </span>
    );
  }

  return (
    <Link
      href={`/c/${container.id}`}
      aria-current={selected ? "page" : undefined}
      className={[
        "flex items-center gap-2 rounded-md px-2 text-base",
        // 44px targets below the panel breakpoint, 36px inside it.
        "h-11 panel:h-9",
        selected
          ? "border-l-2 border-c-party bg-surface2 font-medium text-text"
          : "text-text hover:bg-surface2",
      ].join(" ")}
    >
      {inner}
    </Link>
  );
}
