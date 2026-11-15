import type { Metadata } from "next";

import { ButtonLink } from "@frontend/components/atoms/Button";
import { EmptyState } from "@frontend/components/molecules/EmptyState";

export const metadata: Metadata = { title: "Not found" };

/**
 * Any URL that leads nowhere — a mistyped link, a character sheet that was
 * retired. Next's default page is unstyled and has no way back; this one sends
 * you to your landing container.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col bg-bg">
      <EmptyState
        icon="search"
        title="Nothing here"
        body="This page does not exist, or it is not one you can open."
        action={<ButtonLink href="/">Back to your inventory</ButtonLink>}
      />
    </main>
  );
}
