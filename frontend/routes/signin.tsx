import Link from "next/link";
import { redirect } from "next/navigation";

import { signInAsAction } from "@backend/actions/session";
import { Avatar } from "@frontend/components/atoms/Status";
import { Icon } from "@frontend/components/atoms/Icon";
import { ThemeToggle } from "@frontend/components/atoms/ThemeToggle";
import { type Member, repository, repositoryKind } from "@backend/db";
import { currentSession } from "@backend/lib/session";
import { realtimeKind } from "@backend/realtime";

/**
 * Sign in — SCOPE.md M1.
 *
 * Pick your name from the roster, prove it with a PIN. The roster IS the
 * campaign's membership: a name appears here because the GM put a row in
 * `campaign_members`, so there is no sign-up, no invite to accept, and no
 * screen for someone who is not at this table — they simply never see their
 * name on it.
 *
 * One member is expanded at a time, addressed by `?member=`. That keeps this a
 * server component with no client state: which name is open, and which error is
 * showing, are both in the URL. It also means the page never renders six PIN
 * fields at once, which reads as a form to fill in rather than a person to
 * pick.
 */
const MESSAGES: Record<string, string> = {
  "unknown-member": "That name is not at this table any more.",
  // Deliberately one message for a wrong PIN and for a name with no PIN set:
  // telling them apart tells someone probing the roster which half of the pair
  // they got right.
  "bad-pin": "That PIN is not right.",
  locked: "Too many tries. Wait a few minutes and try again.",
  "weak-pin": "Pick 4 to 8 digits, not all the same, and not 1234.",
  mismatch: "Those two PINs are not the same.",
  "already-enrolled":
    "That name already has a PIN. Enter it, or ask the GM to reset it.",
  "no-containers":
    "You are signed in, but there is nothing here yet. Ask the GM to add a container.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; member?: string }>;
}) {
  const state = await currentSession();
  if (state.kind === "member") redirect("/");

  const { error, member: selectedId } = await searchParams;
  const members = await repository().listMembers();
  const selected = members.find((m) => m.userId === selectedId);
  const message = error ? MESSAGES[error] : undefined;

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

        {message ? (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-md border border-danger bg-danger-weak p-3 text-base text-text"
          >
            <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-danger" />
            <span>{message}</span>
          </p>
        ) : null}

        <div className="mt-6">
          <h2 className="mb-1 font-serif text-lg font-bold text-text">
            {selected ? "Sign in as" : "Sit at the table as"}
          </h2>
          <p className="mb-3 text-sm text-muted">
            {selected
              ? selected.hasPin
                ? "Enter your PIN."
                : "No PIN set yet. Choose one now — you will use it every time."
              : "Each role sees a different set of containers. That is the permission model, not a demo mode."}
          </p>

          {selected ? (
            <PinForm member={selected} />
          ) : (
            <ul className="flex flex-col gap-2">
              {members.map((m) => (
                <li key={m.userId}>
                  <Link
                    href={`/signin?member=${encodeURIComponent(m.userId)}`}
                    className="flex h-12 w-full items-center gap-3 rounded-md border border-border bg-surface px-3 text-left hover:bg-surface2"
                  >
                    <Avatar name={m.displayName} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium text-text">
                        {m.displayName}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {m.role === "gm"
                          ? "Sees and edits everything"
                          : "Own pack and shared containers only"}
                      </span>
                    </span>
                    <Icon
                      name="arrow-right"
                      size={16}
                      className="shrink-0 text-muted"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-6 text-center font-mono text-xs text-faint">
          storage: {repositoryKind()} · sync: {realtimeKind()} · auth: pin
        </p>
      </div>
    </main>
  );
}

/**
 * The PIN step for one member.
 *
 * `hasPin` decides between entering one and choosing one, and choosing asks
 * twice. A mistyped PIN on the way in costs one more attempt; a mistyped PIN
 * while setting one is a PIN nobody knows, on the one member who can no longer
 * enrol — so that case gets the confirmation field and the other does not.
 */
function PinForm({ member }: { member: Member }) {
  const enrolling = !member.hasPin;

  return (
    <form action={signInAsAction} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={member.userId} />

      <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
        <Avatar name={member.displayName} />
        <span className="min-w-0 flex-1 truncate text-base font-medium text-text">
          {member.displayName}
        </span>
        <Link
          href="/signin"
          className="shrink-0 rounded-md px-2 py-1 text-sm text-muted hover:text-primary"
        >
          Change
        </Link>
      </div>

      <div>
        <label htmlFor="pin" className="mb-1 block text-sm font-medium text-text">
          {enrolling ? "Choose a PIN" : "PIN"}
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          required
          autoFocus
          autoComplete={enrolling ? "new-password" : "current-password"}
          // Digits only, and a numeric keypad on a phone: this gets typed
          // one-handed next to a dice tray.
          inputMode="numeric"
          pattern="\d{4,8}"
          minLength={4}
          maxLength={8}
          className="h-10 w-full rounded-md border border-border bg-surface2 px-2 text-base text-text"
        />
        {enrolling ? (
          <p className="mt-1 text-sm text-muted">4 to 8 digits.</p>
        ) : null}
      </div>

      {enrolling ? (
        <div>
          <label
            htmlFor="confirmPin"
            className="mb-1 block text-sm font-medium text-text"
          >
            Confirm PIN
          </label>
          <input
            id="confirmPin"
            name="confirmPin"
            type="password"
            required
            autoComplete="new-password"
            inputMode="numeric"
            pattern="\d{4,8}"
            minLength={4}
            maxLength={8}
            className="h-10 w-full rounded-md border border-border bg-surface2 px-2 text-base text-text"
          />
        </div>
      ) : null}

      <button
        type="submit"
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-base font-bold text-invert hover:bg-primary-hover"
      >
        {enrolling ? "Set PIN and sign in" : "Sign in"}
      </button>
    </form>
  );
}
