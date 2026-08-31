import { Avatar } from "@frontend/components/atoms/Status";
import { Chip } from "@frontend/components/atoms/Chip";
import { Icon } from "@frontend/components/atoms/Icon";
import { Modal } from "@frontend/components/molecules/Modal";
import type { Member } from "@backend/db/repository";
import type { ContainerView } from "@backend/domain/view";
import { canRead, canWrite } from "@backend/lib/permissions";

/**
 * Share — Wireframe.png, the labelled control at the right of the strip row.
 *
 * It reads rather than writes, and that is the honest shape for this app. In
 * Arca you do not share a container with a person: who can see what is decided
 * by the container's KIND and the campaign's roster (SCOPE.md §3), and a Share
 * dialog offering per-person toggles would be inventing a second permission
 * system beside the one the repository actually enforces.
 *
 * So this answers the question the control is really asked — *who can see this,
 * and who can change it?* — by evaluating the real predicates against every
 * member of the table. Every row here is `canRead`/`canWrite` from
 * `backend/lib/permissions.ts`, the same functions the server gates on, so the
 * dialog cannot drift from the rules it is describing. If it says Milo can
 * write, Milo can write.
 */
export function ShareDialog({
  container,
  members,
  closeHref,
}: {
  container: ContainerView;
  members: Member[];
  closeHref: string;
}) {
  const rows = members
    .map((member) => ({
      member,
      // `Member extends Principal`, so the real predicates take it directly.
      read: canRead(member, container),
      write: canWrite(member, container),
    }))
    .sort(
      (a, b) =>
        Number(b.write) - Number(a.write) ||
        Number(b.read) - Number(a.read) ||
        a.member.displayName.localeCompare(b.member.displayName),
    );

  return (
    <Modal
      title={`Who can see ${container.name}`}
      subtitle={REASON[container.type]}
      closeHref={closeHref}
    >
      <ul className="flex flex-col gap-1">
        {rows.map(({ member, read, write }) => (
          <li
            key={member.userId}
            className="flex items-center gap-3 rounded-md px-2 py-2"
          >
            <Avatar name={member.displayName} />
            <span className="min-w-0 flex-1">
              {/* The address is the identity, so it is the line that is read
                  first; the display name is what the table calls them. */}
              <span className="block truncate text-base text-text">
                {member.email}
              </span>
              <span className="block truncate text-sm text-muted">
                {member.displayName}
                {member.role === "gm" ? " · GM" : ""}
              </span>
            </span>

            {write ? (
              <Chip tone="primary">Can edit</Chip>
            ) : read ? (
              <Chip tone="neutral">Can view</Chip>
            ) : (
              <Chip tone="neutral">No access</Chip>
            )}
          </li>
        ))}
      </ul>

      {/* Stated plainly rather than implied by a missing button. Someone who
          opens Share is looking for the control that changes this, and the
          useful answer is where that control actually is. */}
      <p className="mt-4 flex items-start gap-2 rounded-md border border-border bg-surface2 p-3 text-sm text-muted">
        <Icon name="info" size={13} className="mt-0.5 shrink-0" />
        <span>
          Access follows the container&rsquo;s kind and the campaign roster, not
          a per-person setting. To change who can reach this, change its kind or
          its owner in <strong className="text-text">Edit container</strong> — or
          ask the GM to.
        </span>
      </p>
    </Modal>
  );
}

/** Why the answer above is what it is, in the language of the table. */
const REASON: Record<ContainerView["type"], string> = {
  character: "A pack is its owner's. The GM can see every pack.",
  party: "A shared container is the whole table's, to read and to write.",
  world:
    "A world container is the GM's. Players can see it once it is revealed, and never take from it.",
};
