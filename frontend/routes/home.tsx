import { redirect } from "next/navigation";

import { repository } from "@backend/db";
import { currentPrincipal } from "@backend/lib/session";

/**
 * The entry point. There is no landing page: Arca opens inside a panel that is
 * already docked next to the game, so anything between opening it and seeing
 * the inventory is friction with no payoff.
 *
 * A signed-in user lands on a party container — the shared wagon is what the
 * table looks at most, and it is the one container every role can read.
 */
export default async function Home() {
  const principal = await currentPrincipal();
  if (!principal) redirect("/signin");

  const containers = await repository().listContainers(principal);
  const landing = containers.find((c) => c.type === "party") ?? containers[0];
  if (!landing) redirect("/signin?error=no-containers");

  redirect(`/c/${landing.id}`);
}
