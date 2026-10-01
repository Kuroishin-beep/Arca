import { redirect } from "next/navigation";

import { createCampaignAction } from "@backend/actions/campaigns";
import { currentPrincipal } from "@backend/lib/session";
import { Button, ButtonLink } from "@frontend/components/atoms/Button";
import { TextField } from "@frontend/components/atoms/Field";
import { Icon } from "@frontend/components/atoms/Icon";
import { TopBar } from "@frontend/components/organisms/TopBar";

/**
 * Starting a campaign — from "New campaign" in the campaign menu.
 *
 * One field. Whoever starts a campaign is its GM, it arrives with a shared
 * container so there is somewhere to land, and the rest (players, containers,
 * the catalogue) is added from inside it the same way as in any campaign.
 */
export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; name?: string }>;
}) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/signin");
  const { error, name } = await searchParams;

  return (
    <div className="flex h-screen flex-col bg-bg">
      <TopBar principal={principal} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-md flex-col gap-5 p-4 md:p-6">
          <div>
            <ButtonLink href="/" size="sm" icon="pack">
              Back to {principal.campaignName ?? "your campaign"}
            </ButtonLink>
          </div>

          <div>
            <h1 className="font-serif text-2xl font-bold text-text">New campaign</h1>
            <p className="mt-2 text-base text-muted">
              You will be its GM. It starts with one shared container, and you
              add players from its Members page — anyone with an account, or
              anyone new.
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger bg-danger-weak p-3 text-base text-text"
            >
              <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-danger" />
              <span>A campaign needs a name, up to 80 characters.</span>
            </p>
          ) : null}

          <form
            action={createCampaignAction}
            className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
          >
            <TextField
              id="campaign-name"
              name="name"
              label="Campaign name"
              required
              maxLength={80}
              autoFocus
              defaultValue={name ?? ""}
              placeholder="The Misty Vale"
            />
            <Button type="submit" variant="primary">
              Start campaign
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
