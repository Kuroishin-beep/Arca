import Link from "next/link";

/**
 * The switch between signing in and creating an account.
 *
 * Two routes, not one — `/signin` and `/signup` stay in the URL bar and in
 * Wireframes.md's screen map unchanged, and each keeps its own Server Action
 * and its own error vocabulary (`taken` only makes sense on sign-up, `locked`
 * only on sign-in). This is chrome shared by both screens, not a merge of
 * them: a plain link pair, so it works with JavaScript off exactly like the
 * forms underneath it do.
 */
export function AuthTabs({ active }: { active: "signin" | "signup" }) {
  return (
    <div
      role="tablist"
      aria-label="Sign in or create an account"
      className="mb-5 grid grid-cols-2 gap-1 rounded-md border border-border bg-surface2 p-1"
    >
      <Link
        href="/signin"
        role="tab"
        aria-selected={active === "signin"}
        className={[
          "rounded-sm py-1.5 text-center text-sm font-medium",
          active === "signin"
            ? "bg-surface text-text"
            : "text-muted hover:text-text",
        ].join(" ")}
      >
        Log in
      </Link>
      <Link
        href="/signup"
        role="tab"
        aria-selected={active === "signup"}
        className={[
          "rounded-sm py-1.5 text-center text-sm font-medium",
          active === "signup"
            ? "bg-surface text-text"
            : "text-muted hover:text-text",
        ].join(" ")}
      >
        Create account
      </Link>
    </div>
  );
}
