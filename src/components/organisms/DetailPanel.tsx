import Link from "next/link";

import { Chip } from "@/components/atoms/Chip";
import { ContainerDot } from "@/components/atoms/Chip";
import { Icon } from "@/components/atoms/Icon";
import { ButtonLink } from "@/components/atoms/Button";
import { ArchiveItemButton } from "@/components/organisms/ArchiveItemButton";
import {
  CommentComposer,
  ReplyToggle,
} from "@/components/organisms/CommentComposer";
import type { CommentView, ContainerView, ItemView } from "@/domain/view";
import { itemWeight } from "@/domain/view";

/**
 * The selected item, its properties, where it lives, and the conversation about
 * it.
 *
 * Pinned at `lg`; below that it overlays as a sheet. Selection is a URL search
 * param rather than client state so that the panel survives a reload and can be
 * linked to — "look at the circlet" is a message someone will want to send.
 */
export function DetailPanel({
  item,
  container,
  comments,
  canEdit,
  query,
}: {
  item: ItemView;
  container: ContainerView;
  comments: CommentView[];
  canEdit: boolean;
  query: string;
}) {
  // Threading is one level deep (M12), so the shape is a list of roots plus a
  // lookup rather than a recursive tree. The repository already guarantees no
  // grandchildren exist, which is what makes this flat pass sufficient.
  const roots = comments.filter((c) => c.parentId === null);
  const repliesByParent = new Map<string, CommentView[]>();
  for (const comment of comments) {
    if (!comment.parentId) continue;
    repliesByParent.set(comment.parentId, [
      ...(repliesByParent.get(comment.parentId) ?? []),
      comment,
    ]);
  }

  const closeHref = `/c/${container.id}${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  const withItem = (extra: Record<string, string>) => {
    const params = new URLSearchParams({ item: item.id, ...extra });
    if (query) params.set("q", query);
    return `/c/${container.id}?${params.toString()}`;
  };

  return (
    <>
      <div className="flex items-start gap-2 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg font-bold text-text">{item.name}</h2>
          {/* Composable types: one object, several types at once. */}
          <div className="mt-2 flex flex-wrap gap-1">
            {item.types.map((type) => (
              <Chip key={type}>{type}</Chip>
            ))}
          </div>
        </div>
        <Link
          href={closeHref}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface2 hover:text-text"
        >
          <Icon name="close" size={14} />
          <span className="sr-only">Close detail panel</span>
        </Link>
      </div>

      <section className="border-b border-border p-4">
        <h3 className="mb-3 font-serif text-sm font-bold uppercase tracking-wider text-muted">
          Properties
        </h3>
        <dl className="flex flex-col gap-2">
          <Row label="Quantity" value={String(item.qty)} />
          <Row label="Weight (each)" value={`${item.weight.toFixed(1)} kg`} />
          <Row label="Value (each)" value={item.value || "—"} />
          {item.tags.length > 0 ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-sm text-muted">Tags</dt>
              <dd className="flex flex-wrap justify-end gap-1">
                {item.tags.map((tag) => (
                  <Chip key={tag}>{tag}</Chip>
                ))}
              </dd>
            </div>
          ) : null}
          {/* Derived, never stored — schema doc rule 9. */}
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
            <dt className="text-sm text-muted">
              Total weight <span className="text-faint">(derived)</span>
            </dt>
            <dd className="font-mono text-base tabular-nums text-accent">
              {itemWeight(item).toFixed(1)} kg
            </dd>
          </div>
        </dl>
      </section>

      <section className="border-b border-border p-4">
        <h3 className="mb-3 font-serif text-sm font-bold uppercase tracking-wider text-muted">
          Contained in
        </h3>
        <ul className="flex flex-col gap-2">
          <li className="flex items-center gap-2 rounded-md border border-border bg-surface2 px-2 py-2">
            <ContainerDot type={container.type} />
            <span className="min-w-0 flex-1 truncate text-base text-text">
              {container.name}
            </span>
            <span className="shrink-0 text-xs text-muted">×{item.qty}</span>
          </li>
        </ul>

        {canEdit ? (
          <>
            {/* THE action. Given full width in the panel because it is the one
                thing this app exists to make easy. */}
            <ButtonLink
              href={withItem({ dialog: "move" })}
              variant="primary"
              icon="arrow-right"
              fullWidth
              className="mt-3"
            >
              Move item
            </ButtonLink>
            <div className="mt-2 flex gap-2">
              <ButtonLink
                href={withItem({ dialog: "edit" })}
                variant="secondary"
                size="sm"
                className="flex-1"
              >
                Edit
              </ButtonLink>
              <ArchiveItemButton itemId={item.id} itemName={item.name} />
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-md border border-border bg-surface2 p-2 text-sm text-muted">
            You can see this container but not change it.
          </p>
        )}
      </section>

      {item.notes ? (
        <section className="border-b border-border p-4">
          <h3 className="mb-2 font-serif text-sm font-bold uppercase tracking-wider text-muted">
            Notes
          </h3>
          <p className="text-base text-muted">{item.notes}</p>
        </section>
      ) : null}

      <section className="p-4">
        <h3 className="mb-3 font-serif text-sm font-bold uppercase tracking-wider text-muted">
          Comments
        </h3>
        {roots.length === 0 ? (
          <p className="text-base text-muted">Nothing said about this yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {roots.map((comment) => (
              <li
                key={comment.id}
                className="rounded-md border border-border bg-surface2 p-3"
              >
                <CommentBody comment={comment} />
                <ReplyToggle
                  containerId={container.id}
                  parentId={comment.id}
                  authorName={comment.authorName}
                />

                {(repliesByParent.get(comment.id) ?? []).length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-2">
                    {(repliesByParent.get(comment.id) ?? []).map((reply) => (
                      <li
                        key={reply.id}
                        className="ml-3 border-l-2 border-border bg-surface2 pl-3"
                      >
                        <CommentBody comment={reply} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {/* Commenting is gated on READ, not write: a player who can see a
            revealed world container can discuss it even though they cannot
            take from it (SCOPE.md M12, and the note on the repository). */}
        <div className="mt-4 border-t border-border pt-4">
          <CommentComposer containerId={container.id} />
        </div>
      </section>
    </>
  );
}

function CommentBody({ comment }: { comment: CommentView }) {
  return (
    <>
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-bold text-text">
          {comment.authorName}
        </span>
        {comment.authorRole === "gm" ? <Chip tone="primary">GM</Chip> : null}
        <span className="text-xs text-faint">
          {relativeTime(comment.createdAt)}
        </span>
      </div>
      {/* `whitespace-pre-line` so a player's line breaks survive; the content
          is still plain text, never markup. */}
      <p className="whitespace-pre-line text-base text-muted">
        {comment.content}
      </p>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-mono text-base tabular-nums text-text">{value}</dd>
    </div>
  );
}

function relativeTime(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
