import { redirect } from "next/navigation";

import { addMemberAction, resetPasswordAction } from "@backend/actions/members";
import { Avatar } from "@frontend/components/atoms/Status";
import { Chip } from "@frontend/components/atoms/Chip";
import { Icon } from "@frontend/components/atoms/Icon";
import { WorkspaceShell } from "@frontend/components/organisms/WorkspaceShell";
import { repository } from "@backend/db";
import { CAMPAIGN_NAME } from "@backend/db/seed-data";
import { listDatabases } from "@backend/domain/database";
import { canManageRoster, canWrite, creatableContainerTypes } from "@backend/lib/permissions";
import { currentPrincipal } from "@backend/lib/session";

/**
 * The roster — who is at this table, and the GM's two verbs for changing it.
 *
 * The screen the model always assumed and never had. Membership has been the
 * GM's decision since SCOPE.md §3 was written, but the only way to exercise it
 * was an INSERT by hand; adding someone and clearing a forgotten password are
 * both things that happen mid-campaign, and neither should need psql.
 *
 * GM-only, and rendered as a 404-shaped screen for anyone else rather than a
 * "you may not do this" — same rule the workspace applies to a container that
 * is not yours (SCOPE.md §12.3). The actions re-check the principal server-side
 * regardless, because a rendered form is not a permission.
 */
const MESSAGES: Record<string, { tone: "danger" | "success"; text: string }> = {
  "bad-email": { tone: "danger", text: "That is not an email address." },
  "bad-input": { tone: "danger", text: "A name and a role are both required." },
  taken: {
    tone: "danger",
    text: "That email already has an account at this table.",
  },
  forbidden: { tone: "danger", text: "Only the GM can change the roster." },
  "self-reset": {
    tone: "danger",
    text: "Clearing your own password would lock you out with nobody able to let you back in. Ask another GM.",
  },
};

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    added?: string;
    reset?: string;
    nav?: string;
    rail?: string;
  }>;
}) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/signin");

  const sp = await searchParams;
  const repo = repository();

  const [containers, databases] = await Promise.all([
    repo.listContainers(principal),
    listDatabases(repo, principal),
  ]);

  const railCollapsed = sp.rail === "0";
  const writable = containers.find((c) => canWrite(principal, c));
  const shell = {
    principal,
    containers,
    databases,
    campaignName: CAMPAIGN_NAME,
    newContainerHref:
      writable && creatableContainerTypes(principal).length > 0
        ? `/c/${writable.id}?dialog=new-container`
        : undefined,
    newDatabaseHref: writable ? `/c/${writable.id}?dialog=add` : undefined,
    navOpen: sp.nav === "1",
    drawerHref: "/members?nav=1",
    railCollapsed,
    railHref: railCollapsed ? "/members" : "/members?rail=0",
    closeHref: "/members",
  };

  if (!canManageRoster(principal)) {
    return (
      <WorkspaceShell {...shell}>
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-surface2">
            <Icon name="lock" size={22} className="text-muted" />
          </div>
          <h1 className="font-serif text-xl font-bold text-text">Not here</h1>
          <p className="mt-2 max-w-[34ch] text-base text-muted">
            The roster is the GM&rsquo;s. Ask them to add someone.
          </p>
        </div>
      </WorkspaceShell>
    );
  }

  const members = await repo.listMembers();
  const notice = sp.error
    ? MESSAGES[sp.error]
    : sp.added
      ? { tone: "success" as const, text: `${sp.added} can now sign in — they choose their own password the first time.` }
      : sp.reset
        ? { tone: "success" as const, text: "Password cleared. They choose a new one on their next sign-in." }
        : undefined;

  return (
    <WorkspaceShell {...shell}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
          <div className="flex items-center gap-2">
            <Icon name="users" size={18} className="shrink-0 text-primary" />
            <h1 className="font-serif text-xl font-bold text-text">
              Who is at this table
            </h1>
          </div>
          <p className="mt-2 text-base text-muted">
            Anyone can create their own account and join as a player. Adding
            someone here is how you seat a GM, or save a player the sign-up.
          </p>

          {notice ? (
            <p
              role="alert"
              className={`mt-4 flex items-start gap-2 rounded-md border p-3 text-base text-text ${
                notice.tone === "danger"
                  ? "border-danger bg-danger-weak"
                  : "border-border bg-success-weak"
              }`}
            >
              <Icon
                name={notice.tone === "danger" ? "alert" : "check"}
                size={14}
                className={`mt-0.5 shrink-0 ${
                  notice.tone === "danger" ? "text-danger" : "text-success"
                }`}
              />
              <span>{notice.text}</span>
            </p>
          ) : null}

          <ul className="mt-6 flex flex-col gap-1">
            {members.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
              >
                <Avatar name={member.displayName} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base text-text">
                    {member.email}
                  </span>
                  <span className="block truncate text-sm text-muted">
                    {member.displayName}
                  </span>
                </span>

                {member.role === "gm" ? (
                  <Chip tone="primary">GM</Chip>
                ) : (
                  <Chip tone="neutral">Player</Chip>
                )}

                {/* The enrolment state, said plainly. "Has not signed in yet"
                    is the difference between a member who forgot their
                    password and one who never had one, and the GM needs to
                    tell them apart before reaching for Reset. */}
                {member.hasPassword ? null : (
                  <Chip tone="warning">No password yet</Chip>
                )}

                {member.hasPassword && member.userId !== principal.userId ? (
                  <form action={resetPasswordAction}>
                    <input type="hidden" name="userId" value={member.userId} />
                    <button
                      type="submit"
                      className="h-8 shrink-0 rounded-md border border-border px-2 text-sm text-muted hover:border-danger hover:text-danger"
                    >
                      Reset password
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>

          <form
            action={addMemberAction}
            className="mt-8 flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
          >
            <h2 className="font-serif text-lg font-bold text-text">
              Add someone
            </h2>
            {/* No password field, and that is the point: a secret the GM
                chooses has to travel through the group chat, which is the
                least private channel the table has. They arrive unenrolled and
                choose their own. */}
            <p className="text-sm text-muted">
              They pick their own password the first time they sign in — you
              never handle it.
            </p>

            <div>
              <label
                htmlFor="displayName"
                className="mb-1 block text-sm font-medium text-text"
              >
                Name
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                maxLength={80}
                className="h-10 w-full rounded-md border border-border bg-surface2 px-2 text-base text-text"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-sm font-medium text-text"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="them@example.com"
                className="h-10 w-full rounded-md border border-border bg-surface2 px-2 text-base text-text placeholder:text-faint"
              />
            </div>

            <fieldset>
              <legend className="mb-1 text-sm font-medium text-text">Role</legend>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-base text-text">
                  <input
                    type="radio"
                    name="role"
                    value="player"
                    defaultChecked
                    className="h-4 w-4"
                  />
                  Player
                </label>
                <label className="flex items-center gap-2 text-base text-text">
                  <input type="radio" name="role" value="gm" className="h-4 w-4" />
                  GM
                </label>
              </div>
            </fieldset>

            <button
              type="submit"
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-base font-bold text-invert hover:bg-primary-hover"
            >
              <Icon name="plus" size={14} />
              Add member
            </button>
          </form>
        </div>
      </div>
    </WorkspaceShell>
  );
}
