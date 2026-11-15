import type { Metadata } from "next";

import { ButtonLink } from "@frontend/components/atoms/Button";
import { Logo } from "@frontend/components/atoms/Logo";
import { CHANGELOG } from "@frontend/constants/changelog";

export const metadata: Metadata = { title: "What's new" };

/** Every change, newest first — where the top-of-app banner points. */
export default function ChangelogPage() {
  return (
    <main className="min-h-dvh bg-bg px-4 py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <Logo size={32} />
          <h1 className="font-serif text-2xl font-bold text-text">What&apos;s new</h1>
          <ButtonLink href="/" size="sm" className="ml-auto">
            Back to Arca
          </ButtonLink>
        </div>

        <ol className="flex flex-col gap-4">
          {CHANGELOG.map((entry) => (
            <li key={entry.id} className="rounded-md border border-border bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-lg font-bold text-text">{entry.title}</h2>
                <time dateTime={entry.date} className="font-mono text-xs text-faint">
                  {entry.date}
                </time>
              </div>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-base text-muted">
                {entry.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
