import { redirect } from "next/navigation";

import { signInAsAction } from "@backend/actions/session";
import { Icon } from "@frontend/components/atoms/Icon";
import { ThemeToggle } from "@frontend/components/atoms/ThemeToggle";
import { repositoryKind } from "@backend/db";
import { currentSession } from "@backend/lib/session";
import { realtimeKind } from "@backend/realtime";

/**
 * Sign in — SCOPE.md M1.
 *
 * Type the address the GM has for you, and your password. Membership is still
 * the campaign's roster: an address works because the GM put a row in
 * `campaign_members`, so there is no sign-up and no invite to accept.
 *
 * What changed when this stopped being a name picker: the roster is no longer
 * on the page. Listing six names to anyone holding the link was always the
 * weakest part of that screen — it published who is at this table — and the
 * only reason it was there was that the PIN step needed to know which member it
 * was asking about. An address the person already knows removes the need, so
 * the list goes with it.
 *
 * Still a server component with no client state: the typed address and the
 * error are both in the URL.
 */
const MESSAGES: Record<string, string> = {
  "bad-email": "That is not an email address.",
  // Deliberately one message for a wrong password, an address with no password
  // set, and an address that is not at this table at all. Telling them apart
  // tells someone spraying addresses which ones belong to the campaign.
  "bad-credentials": "That email and password do not match.",
  locked: "Too many tries. Wait a few minutes and try again.",
  "weak-password":
    "Pick at least 8 characters, and not something obvious.",
  mismatch: "Those two passwords are not the same.",
  "no-containers":
    "You are signed in, but there is nothing here yet. Ask the GM to add a container.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const state = await currentSession();
  if (state.kind === "member") redirect("/");

  const { error, email } = await searchParams;
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
            Sit at the table
          </h2>
          <p className="mb-3 text-sm text-muted">
            Your email is the one the GM added to this campaign. Each role sees a
            different set of containers — that is the permission model, not a
            demo mode.
          </p>

          <SignInForm email={email ?? ""} />
        </div>

        <p className="mt-6 text-center font-mono text-xs text-faint">
          storage: {repositoryKind()} · sync: {realtimeKind()} · auth: email
        </p>
      </div>
    </main>
  );
}

/**
 * One form, both cases.
 *
 * The confirm field is always rendered rather than appearing once the app knows
 * whether this address has a password. Revealing that is the whole leak the
 * combined form exists to avoid, and a field that appears in response to a
 * typed address announces the answer as loudly as a sentence would.
 *
 * So it is labelled for what it is — needed the first time, ignored after —
 * and `backend/actions/session.ts` treats a filled confirm as "this is a first
 * sign-in" and an empty one as an ordinary attempt.
 */
function SignInForm({ email }: { email: string }) {
  return (
    <form action={signInAsAction} className="flex flex-col gap-3">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-text">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus={email === ""}
          autoComplete="username"
          defaultValue={email}
          // `email` rather than `text`: on a phone this is the difference
          // between a keyboard with an @ key and one without.
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          className="h-10 w-full rounded-md border border-border bg-surface2 px-2 text-base text-text"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1 block text-sm font-medium text-text"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus={email !== ""}
          autoComplete="current-password"
          minLength={8}
          maxLength={200}
          className="h-10 w-full rounded-md border border-border bg-surface2 px-2 text-base text-text"
        />
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="mb-1 block text-sm font-medium text-text"
        >
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          maxLength={200}
          className="h-10 w-full rounded-md border border-border bg-surface2 px-2 text-base text-text"
        />
        <p className="mt-1 text-sm text-muted">
          Only the first time you sign in. Leave it empty after that.
        </p>
      </div>

      <button
        type="submit"
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-base font-bold text-invert hover:bg-primary-hover"
      >
        Sign in
      </button>

      <p className="text-center text-sm text-muted">
        Forgot it? There is no reset mail to send — ask the GM to clear your
        password and sign in again.
      </p>
    </form>
  );
}
