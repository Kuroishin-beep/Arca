import Link from "next/link";

import { switchCampaignAction } from "@backend/actions/campaigns";
import { repository } from "@backend/db";
import type { Principal } from "@backend/domain/view";
import { Chip } from "@frontend/components/atoms/Chip";
import { Icon } from "@frontend/components/atoms/Icon";
import { MenuDetails } from "@frontend/components/molecules/MenuDetails";

/**
 * The campaign name in the sidebar, as the menu it always looked like.
 *
 * It used to be a heading with a decorative chevron: there was one campaign,
 * so there was nothing to open. Now it lists every campaign this person is in
 * — with what they are in each, since the same person can be GM of one table
 * and a player at another — switches between them, and starts a new one.
 *
 * A `<details>` rather than a client-side menu, like the container actions:
 * it opens without JavaScript, and each campaign is a form, so switching is a
 * plain POST the server checks.
 */
export async function CampaignMenu({
  principal,
  campaignName,
}: {
  principal: Principal;
  campaignName: string;
}) {
  const seats = await repository().membershipsOf(principal.userId);

  return (
    <MenuDetails className="group relative min-w-0 flex-1">
      <summary
        className="flex min-w-0 cursor-pointer list-none items-center gap-2 rounded-md px-1 py-1 marker:content-[''] hover:bg-surface2 [&::-webkit-details-marker]:hidden"
        aria-label={`${campaignName} — switch campaign`}
      >
        <Icon name="chest" size={15} className="shrink-0 text-primary" />
        <h2 className="min-w-0 flex-1 truncate font-serif text-sm font-bold text-text">
          {campaignName}
        </h2>
        <Icon
          name="chevron-down"
          size={12}
          className="shrink-0 text-muted transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="absolute left-0 right-0 top-full z-30 mt-1 min-w-[15rem] rounded-md border border-border bg-surface3 py-1 shadow-modal">
        <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          Your campaigns
        </p>
        <ul>
          {seats.map((seat) => {
            const current = seat.campaignId === principal.campaignId;
            return (
              <li key={seat.campaignId}>
                <form action={switchCampaignAction}>
                  <input type="hidden" name="campaignId" value={seat.campaignId} />
                  <button
                    type="submit"
                    aria-current={current ? "true" : undefined}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2 ${
                      current ? "font-semibold text-text" : "text-text"
                    }`}
                  >
                    <span className="grid w-4 shrink-0 place-items-center">
                      {current ? <Icon name="check" size={13} className="text-primary" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{seat.campaignName}</span>
                    <Chip tone={seat.role === "gm" ? "primary" : "neutral"}>
                      {seat.role === "gm" ? "GM" : "Player"}
                    </Chip>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>

        <div className="my-1 border-t border-border" />

        <Link
          href="/campaigns/new"
          className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface2"
        >
          <span className="grid w-4 shrink-0 place-items-center">
            <Icon name="plus" size={13} className="text-muted" />
          </span>
          New campaign
        </Link>
        {principal.role === "gm" ? (
          <Link
            href="/members"
            className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface2"
          >
            <span className="grid w-4 shrink-0 place-items-center">
              <Icon name="users" size={13} className="text-muted" />
            </span>
            Members of {campaignName}
          </Link>
        ) : null}
      </div>
    </MenuDetails>
  );
}
