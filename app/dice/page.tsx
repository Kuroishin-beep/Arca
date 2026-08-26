import { redirect } from "next/navigation";

import { Chip } from "@/components/atoms/Chip";
import { ButtonLink } from "@/components/atoms/Button";
import { DiceFinder } from "@/components/organisms/DiceFinder";
import { TopBar } from "@/components/organisms/TopBar";
import { currentPrincipal } from "@/lib/session";

/**
 * diceFinder — ★ STRETCH SCOPE ★ (SCOPE.md §6.2, S2).
 *
 * Arca never rolls the dice. It parses the notation and hands it to TaleSpire's
 * own roller, so the result is public and physical on the table rather than a
 * number in one player's private panel. That is the entire point of the
 * feature, and it is why `Throw` is disabled outside the Symbiote instead of
 * quietly falling back to Math.random().
 */
export default async function DicePage() {
  const principal = await currentPrincipal();
  if (!principal) redirect("/signin");

  return (
    <div className="flex h-screen flex-col bg-bg">
      <TopBar principal={principal} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="warning">Stretch scope</Chip>
            <ButtonLink href="/" size="sm">
              Inventory
            </ButtonLink>
          </div>
          <DiceFinder />
        </div>
      </main>
    </div>
  );
}
