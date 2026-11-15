import type { Metadata } from "next";

import { requestPasswordResetAction } from "@backend/actions/account";
import { Button, ButtonLink } from "@frontend/components/atoms/Button";
import { TextField } from "@frontend/components/atoms/Field";
import { Icon } from "@frontend/components/atoms/Icon";
import { Logo } from "@frontend/components/atoms/Logo";

export const metadata: Metadata = { title: "Forgot password" };

const MESSAGES: Record<string, string> = {
  "bad-email": "That is not an email address.",
  locked: "Too many tries. Wait a few minutes and try again.",
};

/**
 * Forgot password. Arca sends no mail, so this asks the GM instead: the
 * request appears on the GM's Members page beside the reset button, and once
 * the GM resets it, the player chooses a new password at sign-in.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; email?: string }>;
}) {
  const { sent, error, email } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo size={48} className="mx-auto mb-3" />
          <h1 className="font-serif text-2xl font-bold text-text">Forgot your password?</h1>
        </div>

        {sent ? (
          <div className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4">
            <p className="flex items-start gap-2 text-base text-text">
              <Icon name="check" size={16} className="mt-1 shrink-0 text-success" />
              <span>
                If that address has an account, your GM will now see a reset request
                on their Members page.
              </span>
            </p>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
              <li>
                Your GM presses <strong>Reset password</strong> next to your name.
              </li>
              <li>
                You sign in with your email, open <strong>First time signing in?</strong>{" "}
                and choose a new password.
              </li>
            </ol>
            <ButtonLink href="/signin" variant="primary">
              Back to sign in
            </ButtonLink>
          </div>
        ) : (
          <form action={requestPasswordResetAction} className="flex flex-col gap-3">
            <p className="text-base text-muted">
              Arca sends no email. Enter yours and your GM will be asked to reset your
              password.
            </p>
            {message ? (
              <p
                role="alert"
                className="rounded-md border border-danger bg-danger-weak p-3 text-sm text-text"
              >
                {message}
              </p>
            ) : null}
            <TextField
              id="email"
              name="email"
              label="Email"
              type="email"
              required
              autoFocus
              autoComplete="username"
              defaultValue={email ?? ""}
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
            />
            <Button type="submit" variant="primary" fullWidth className="h-10 text-base">
              Ask my GM to reset it
            </Button>
            <ButtonLink href="/signin" variant="ghost">
              Back to sign in
            </ButtonLink>
          </form>
        )}
      </div>
    </main>
  );
}
