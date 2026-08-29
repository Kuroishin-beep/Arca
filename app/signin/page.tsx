import { redirect } from "next/navigation";

import { signInAsAction } from "@/actions/session";
import { Avatar } from "@/components/atoms/Status";
import { Icon } from "@/components/atoms/Icon";
import { repository, repositoryKind } from "@/db";
import { currentPrincipal } from "@/lib/session";

/**
 * Sign in — SCOPE.md M1.
 *
 * The real flow is Discord OAuth (§4): the campaign already coordinates on
 * Discord, so there is no new account to create. That is phase 1. Until then
 * this screen picks a seeded member, which is what makes the permission rules
 * testable by hand — sign in as Kova, try to open the vault, watch it refuse.
 *
 * The Discord button is present and disabled rather than absent, so the shape
 * of the finished screen is already settled.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const principal = await currentPrincipal();
  if (principal) redirect("/");

  const { error } = await searchParams;
  const members = await repository().listMembers();

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <Icon
            name="chest"
            size={48}
            strokeWidth={1.2}
            className="mx-auto mb-4 text-primary"
          />
          <h1 className="font-serif text-2xl font-bold text-text">Arca</h1>
          <p className="mt-2 text-base text-muted">
            Shared inventory for the Ravenholt Westmarch. Runs inside TaleSpire.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-md border border-danger bg-danger-weak p-3 text-base text-text"
          >
            <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-danger" />
            <span>
              {error === "no-containers"
                ? "That account is not a member of this campaign. Ask the GM to add you."
                : "Could not sign you in. Try again."}
            </span>
          </p>
        ) : null}

        <button
          type="button"
          disabled
          title="Discord OAuth lands in phase 1 — see SCOPE.md §4"
          className="mt-6 flex h-10 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md bg-surface3 text-base font-bold text-faint"
        >
          <Icon name="discord" size={16} />
          Continue with Discord
        </button>
        <p className="mt-2 text-center text-sm text-faint">
          Discord sign-in arrives in phase 1.
        </p>

        <div className="mt-6 border-t border-border pt-6">
          <h2 className="mb-1 font-serif text-lg font-bold text-text">
            Sit at the table as
          </h2>
          <p className="mb-3 text-sm text-muted">
            Each role sees a different set of containers. That is the permission
            model, not a demo mode.
          </p>

          <ul className="flex flex-col gap-2">
            {members.map((member) => (
              <li key={member.userId}>
                <form action={signInAsAction}>
                  <input type="hidden" name="userId" value={member.userId} />
                  <button
                    type="submit"
                    className="flex h-12 w-full items-center gap-3 rounded-md border border-border bg-surface px-3 text-left hover:bg-surface2"
                  >
                    <Avatar name={member.displayName} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium text-text">
                        {member.displayName}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {member.role === "gm"
                          ? "Sees and edits everything"
                          : "Own pack and shared containers only"}
                      </span>
                    </span>
                    <Icon
                      name="arrow-right"
                      size={16}
                      className="shrink-0 text-muted"
                    />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-center font-mono text-xs text-faint">
          storage: {repositoryKind()}
        </p>
      </div>
    </main>
  );
}
