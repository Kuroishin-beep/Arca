"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createCommentAction } from "@/actions/comments";
import { Button } from "@/components/atoms/Button";

/**
 * Posting to a container's thread — M12.
 *
 * A client component only because it needs three things a bare form does not
 * give: an inline error, a cleared textarea on success, and a pending label.
 * The submit still goes through the Server Action, so it degrades to a normal
 * form post if hydration has not happened yet.
 */
export function CommentComposer({
  containerId,
  parentId = null,
  placeholder = "Add a comment…",
  autoFocus = false,
  onDone,
}: {
  containerId: string;
  parentId?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  /** Reply forms close themselves after posting; the top-level one stays. */
  onDone?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  return (
    <form
      ref={formRef}
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          const result = await createCommentAction(formData);
          if (!result.ok) {
            setError(result.error ?? "Could not post that.");
            return;
          }
          formRef.current?.reset();
          router.refresh();
          onDone?.();
        })
      }
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="containerId" value={containerId} />
      {parentId ? (
        <input type="hidden" name="parentId" value={parentId} />
      ) : null}

      <label htmlFor={`comment-${parentId ?? "root"}`} className="sr-only">
        {parentId ? "Write a reply" : "Write a comment"}
      </label>
      <textarea
        id={`comment-${parentId ?? "root"}`}
        name="content"
        rows={parentId ? 2 : 3}
        required
        maxLength={1000}
        autoFocus={autoFocus}
        placeholder={placeholder}
        disabled={pending}
        className="w-full resize-y rounded-md border border-border bg-surface2 p-2 text-base text-text placeholder:text-faint disabled:opacity-60"
      />

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          {pending ? "Posting…" : parentId ? "Reply" : "Post"}
        </Button>
        {onDone ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={onDone}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** A top-level comment's reply affordance: a button that swaps itself for a
 *  composer, so an unopened thread costs one line rather than a form each. */
export function ReplyToggle({
  containerId,
  parentId,
  authorName,
}: {
  containerId: string;
  parentId: string;
  authorName: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-sm font-medium text-muted hover:text-text"
      >
        Reply<span className="sr-only"> to {authorName}</span>
      </button>
    );
  }

  return (
    <div className="mt-2">
      <CommentComposer
        containerId={containerId}
        parentId={parentId}
        placeholder={`Reply to ${authorName}…`}
        autoFocus
        onDone={() => setOpen(false)}
      />
    </div>
  );
}
