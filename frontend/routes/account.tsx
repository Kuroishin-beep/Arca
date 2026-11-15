import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { changePasswordAction } from "@backend/actions/account";
import { Button, ButtonLink } from "@frontend/components/atoms/Button";
import { Icon } from "@frontend/components/atoms/Icon";
import { PasswordField } from "@frontend/components/atoms/PasswordField";
import { currentPrincipal } from "@backend/lib/session";

export const metadata: Metadata = { title: "Account" };

const MESSAGES: Record<string, string> = {
  "wrong-password": "That is not your current password.",
  "weak-password": "Pick at least 8 characters, and not something obvious.",
  mismatch: "The two new passwords are not the same.",
  locked: "Too many tries. Wait a few minutes and try again.",
};

/** Your account: who you are signed in as, and changing your password. */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string }>;
}) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/signin");
  const { error, changed } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  return (
    <main className="flex min-h-full justify-center p-4 md:p-8">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-2xl font-bold text-text">Account</h1>
          <ButtonLink href="/" size="sm" className="ml-auto">
            Back to Arca
          </ButtonLink>
        </div>

        <section className="rounded-md border border-border bg-surface p-4">
          <p className="text-base text-text">{principal.displayName}</p>
          <p className="text-sm text-muted">{principal.email}</p>
        </section>

        <section className="rounded-md border border-border bg-surface p-4">
          <h2 className="mb-3 font-serif text-lg font-bold text-text">Change password</h2>
          {changed ? (
            <p
              role="status"
              className="mb-3 flex items-center gap-2 rounded-md border border-success bg-success-weak p-3 text-sm text-text"
            >
              <Icon name="check" size={14} className="text-success" />
              Password changed.
            </p>
          ) : null}
          {message ? (
            <p
              role="alert"
              className="mb-3 rounded-md border border-danger bg-danger-weak p-3 text-sm text-text"
            >
              {message}
            </p>
          ) : null}
          <form action={changePasswordAction} className="flex flex-col gap-3">
            <PasswordField
              id="currentPassword"
              name="currentPassword"
              label="Current password"
              required
              autoComplete="current-password"
            />
            <PasswordField
              id="newPassword"
              name="newPassword"
              label="New password"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <PasswordField
              id="confirmPassword"
              name="confirmPassword"
              label="New password again"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <Button type="submit" variant="primary">
              Change password
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
