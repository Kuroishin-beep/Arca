import Link from "next/link";

import { Icon } from "@frontend/components/atoms/Icon";
import { RevealToggle } from "@frontend/components/organisms/RevealToggle";
import type { ContainerView, Principal } from "@backend/domain/view";
import { canRetireContainer } from "@backend/lib/permissions";

/**
 * Share, and the overflow menu — the right-hand end of Wireframe.png's strip
 * row.
 *
 * These were loose buttons in the container header before: Edit sat beside the
 * title, and Retire was only reachable from inside the edit dialog. The
 * wireframe puts a labelled Share next to a `⋯`, which is the right shape for
 * the reason wireframes usually are — the header is where the container's NAME
 * is, and hanging three verbs off it made the one thing you read first compete
 * with the things you do rarely.
 *
 * The menu is a `<details>`, not a popover component. It opens, closes on `Esc`
 * and is keyboard-reachable with no JavaScript at all, which matters on a
 * screen where every other control is already a link or a form.
 */
export function ContainerActions({
  container,
  principal,
  /** Anyone who may write may also rename and re-capacitate. */
  editable,
}: {
  container: ContainerView;
  principal: Principal;
  editable: boolean;
}) {
  const isGm = principal.role === "gm";
  const base = `/c/${container.id}`;
  const canRetire = canRetireContainer(principal, container);

  return (
    <>
      <Link
        href={`${base}?dialog=share`}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-xs font-medium text-muted hover:bg-surface2 hover:text-text"
      >
        <Icon name="share" size={12} />
        Share
      </Link>

      {/* A world container's reveal is the one action urgent enough to stay
          out of the menu: it is how the table learns the chest exists, and it
          happens mid-scene. */}
      {isGm && container.type === "world" ? (
        <RevealToggle
          containerId={container.id}
          revealed={container.revealed}
        />
      ) : null}

      {editable ? (
        <details className="relative shrink-0">
          <summary
            // `list-none` plus the marker rule kills the disclosure triangle in
            // every engine; without both, Safari keeps drawing it.
            className="grid h-7 w-7 cursor-pointer list-none place-items-center rounded-md border border-border bg-surface text-muted marker:content-[''] hover:bg-surface2 hover:text-text [&::-webkit-details-marker]:hidden"
            aria-label={`More actions for ${container.name}`}
            title="More actions"
          >
            <Icon name="more" size={13} />
          </summary>

          <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-border bg-surface3 py-1 shadow-modal">
            <MenuLink href={`${base}?dialog=edit-container`} icon="filter">
              Edit container
            </MenuLink>
            <MenuLink href={`${base}?dialog=add`} icon="plus">
              Add item
            </MenuLink>
            {/* Retiring is inside the edit dialog, which is where the
                confirmation and the "still has items" refusal already live.
                Linking straight to a destructive action from a menu would put
                one click between a mis-tap and a missing container. */}
            {canRetire ? (
              <MenuLink href={`${base}?dialog=edit-container`} icon="trash">
                Retire container…
              </MenuLink>
            ) : null}
          </div>
        </details>
      ) : null}
    </>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: "filter" | "plus" | "trash";
  children: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-9 items-center gap-2 px-3 text-sm text-text hover:bg-surface2"
    >
      <Icon name={icon} size={13} className="shrink-0 text-muted" />
      {children}
    </Link>
  );
}
