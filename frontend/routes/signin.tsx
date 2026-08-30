import { redirect } from "next/navigation";

import {
  signInAsAction,
  signInWithDiscordAction,
  signOutAction,
} from "@backend/actions/session";
import { Avatar } from "@frontend/components/atoms/Status";
import { Icon } from "@frontend/components/atoms/Icon";
import { ThemeToggle } from "@frontend/components/atoms/ThemeToggle";
import { repository, repositoryKind } from "@backend/db";
import { authConfigured } from "@backend/lib/auth";
import { currentSession } from "@backend/lib/session";
import { realtimeKind } from "@backend/realtime";

/**
 * Sign in — SCOPE.md M1.
 *
 * Three states, not two. "Not signed in" and "signed in but not a member of
 * this campaign" are different situations and get different screens: M1 is
 * explicit that a non-member sees a "not in this campaign" screen and never a
 * container list, and offering a stranger the sign-in button again would just
 * loop them through OAuth to the same place.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const state = await currentSession();
  if (state.kind === "member") redirect("/");

  const { error } = await searchParams;

  if (state.kind === "outsider") {
    return <NotInCampaign {...state.outsider} />;
  }

  const discord = authConfigured();
  // Only meaningful for the picker, and querying members on a Discord-only
  // deployment would list the campaign's roster to anyone who loads the page.
  const members = discord ? [] : await repository().listMembers();

  return (
    <main className="relative flex min-h-full items-center justify-center p-4">
      {/* Reachable before sign-in: someone who needs a dark panel needs it on
          the first screen, not only once they are inside. */}
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

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

        {discord ? (
          <form action={signInWithDiscordAction}>
            <button
              type="submit"
              className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-base font-bold text-invert hover:bg-primary-hover"
            >
              <Icon name="discord" size={16} />
              Continue with Discord
            </button>
          </form>
        ) : (
          <>
            <button
              type="button"
              disabled
              title="Set AUTH_DISCORD_ID, AUTH_DISCORD_SECRET and AUTH_SECRET to enable"
              className="mt-6 flex h-10 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md bg-surface3 text-base font-bold text-faint"
            >
              <Icon name="discord" size={16} />
              Continue with Discord
            </button>
            <p className="mt-2 text-center text-sm text-faint">
              Not configured on this deployment.
            </p>

            <div className="mt-6 border-t border-border pt-6">
              <h2 className="mb-1 font-serif text-lg font-bold text-text">
                Sit at the table as
              </h2>
              <p className="mb-3 text-sm text-muted">
                Each role sees a different set of containers. That is the
                permission model, not a demo mode.
              </p>

              <ul className="flex flex-col gap-2">
                {members.map((member) => (
                  <li key={member.userId}>
                    <form action={signInAsAction}>
                      <input
                        type="hidden"
                        name="userId"
                        value={member.userId}
                      />
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
          </>
        )}

        <p className="mt-6 text-center font-mono text-xs text-faint">
          storage: {repositoryKind()} · sync: {realtimeKind()} · auth:{" "}
          {discord ? "discord" : "picker"}
        </p>
      </div>
    </main>
  );
}

/**
 * M1's non-member screen.
 *
 * It shows the signed-in Discord id on purpose. Linking an account is one
 * `UPDATE users SET discord_id = …` by the GM, and the alternative to printing
 * the id here is the player hunting through Discord's developer mode to find
 * it — a support conversation per player, for a table of six.
 */
function NotInCampaign({
  discordId,
  displayName,
}: {
  discordId: string;
  displayName: string;
}) {
  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-warning-weak">
          <Icon name="lock" size={22} className="text-warning" />
        </div>
        <h1 className="font-serif text-xl font-bold text-text">
          Not at this table
        </h1>
        <p className="mt-2 text-base text-muted">
          You are signed in to Discord as{" "}
          <strong className="text-text">{displayName}</strong>, but that account
          is not a member of this campaign.
        </p>

        <div className="mt-5 rounded-md border border-border bg-surface p-3 text-left">
          <p className="text-sm text-muted">Give your GM this Discord id:</p>
          <p className="mt-1 select-all break-all font-mono text-base text-text">
            {discordId}
          </p>
        </div>

        <form action={signOutAction}>
          <button
            type="submit"
            className="mt-5 h-10 w-full rounded-md border border-border bg-surface text-base font-medium text-text hover:bg-surface2"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
