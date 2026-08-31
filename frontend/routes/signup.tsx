import Link from "next/link";
import { redirect } from "next/navigation";

import { signUpAction } from "@backend/actions/session";
import { Icon } from "@frontend/components/atoms/Icon";
import { PasswordField } from "@frontend/components/atoms/PasswordField";
import { ThemeToggle } from "@frontend/components/atoms/ThemeToggle";
import { storageProblem } from "@backend/db";
import { currentSession } from "@backend/lib/session";

/**
 * Create an account — SCOPE.md M1.
 *
 * Anyone with the link may join this campaign, as a **player**. That is a real
 * loosening of who can reach the table and it is recorded as one in SCOPE.md
 * §3: before this, membership was the GM's decision alone and there was no
 * sign-up at all.
 *
 * What it does NOT loosen is worth being precise about, because "anyone can
 * join" sounds larger than it is. A new player sees party containers and
 * revealed world containers, which is what any player sees. They do not get a
 * pack — a character container is created and owned deliberately — they cannot
 * take from a world container, and they cannot become a GM: `SignUpInput` has
 * no role field, and `registerMember` hard-codes `player`. The GM's own door
 * (`/members`) is the one that can hand out a role.
 *
 * A server component. The typed name, the typed address and the error are all
 * in the URL; the only client code on the page is the password field's
 * show/hide.
 */
const MESSAGES: Record<string, string> = {
  "bad-name": "Enter the name the table calls you.",
  "bad-email": "That is not an email address.",
  // The one honest leak in the app, and it is unavoidable — see signUpAction.
  taken: "That email already has an account. Sign in instead.",
  locked: "Too many tries. Wait a few minutes and try again.",
  "weak-password": "Pick at least 8 characters, and not something obvious.",
  mismatch: "Those two passwords are not the same.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; name?: string }>;
}) {
  const state = await currentSession();
  if (state.kind === "member") redirect("/");

  const { error, email, name } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;
  const problem = await storageProblem();

  return (
    <main className="relative flex min-h-full items-center justify-center p-4">
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

        {problem ? (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-md border border-warning bg-warning-weak p-3 text-base text-text"
          >
            <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-warning" />
            {/* Rendered BEFORE the form is used rather than after it fails.
                Submitting into an unreachable database produced a 500 whose
                only content was the generated SQL — on the one screen where
                somebody meets this app for the first time. */}
            <span>{problem}</span>
          </p>
        ) : null}


        <div className="mt-6">
          <h2 className="mb-1 font-serif text-lg font-bold text-text">
            Pull up a chair
          </h2>
          {/* Said before they fill anything in, not after. Someone expecting to
              arrive as the GM should find that out now. */}
          <p className="mb-3 text-sm text-muted">
            You join as a player: the party&rsquo;s containers and whatever the
            GM has revealed. Ask the GM for a pack of your own, or for the GM
            seat.
          </p>

          <form action={signUpAction} className="flex flex-col gap-3">
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
                autoFocus
                autoComplete="nickname"
                defaultValue={name ?? ""}
                maxLength={80}
                placeholder="What the table calls you"
                className="h-10 w-full rounded-md border border-border bg-surface2 px-2 text-base text-text placeholder:text-faint"
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
                autoComplete="username"
                defaultValue={email ?? ""}
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
                className="h-10 w-full rounded-md border border-border bg-surface2 px-2 text-base text-text placeholder:text-faint"
              />
            </div>

            <PasswordField
              id="password"
              name="password"
              label="Password"
              hint="At least 8 characters. There is no reset mail, so pick one you will remember."
              required
              autoComplete="new-password"
              minLength={8}
            />

            <PasswordField
              id="confirmPassword"
              name="confirmPassword"
              label="Confirm password"
              required
              autoComplete="new-password"
              minLength={8}
            />

            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-base font-bold text-invert hover:bg-primary-hover"
            >
              Create account
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-muted">
            Already have one?{" "}
            <Link href="/signin" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
