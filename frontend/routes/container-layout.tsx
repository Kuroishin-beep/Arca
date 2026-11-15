import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { repository } from "@backend/db";
import { resolveContainerId } from "@backend/lib/container-ref";
import { containerPath, isCanonicalRef } from "@backend/lib/paths";
import { PermissionError } from "@backend/lib/permissions";
import { currentPrincipal } from "@backend/lib/session";

/**
 * Sends `/c/<old id>` and `/c/<old-name>-<suffix>` to the container's current
 * readable address. A layout rather than the page, because the page is wrapped
 * in a loading skeleton and only a redirect made BEFORE that streams is a real
 * 307 — see `proxy.ts`, which supplies the query string kept across it.
 *
 * A signed-out visitor is sent to sign-in from here for the same reason.
 *
 * Only a container the viewer may read is redirected, so the address never
 * reveals a sealed container's name; everything else falls through to the
 * page, which answers it exactly as before.
 */
export default async function ContainerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ containerId: string }>;
}) {
  // Signed out: to sign-in here, as a real 307. Left to the page, the redirect
  // came after the loading skeleton had streamed, so it arrived as a 200 and a
  // second, client-side navigation.
  const principal = await currentPrincipal();
  if (!principal) redirect("/signin");

  const { containerId: ref } = await params;
  const repo = repository();
  const id = await resolveContainerId(repo, principal, ref);
  if (!id) return children;

  let container = null;
  try {
    container = await repo.getContainer(principal, id);
  } catch (error) {
    if (!(error instanceof PermissionError)) throw error;
  }
  if (container && !isCanonicalRef(ref, container)) {
    const search = (await headers()).get("x-arca-search") ?? "";
    redirect(encodeURI(containerPath(container)) + search);
  }
  return children;
}
