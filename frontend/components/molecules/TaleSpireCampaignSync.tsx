"use client";

import { useEffect, useRef, useState } from "react";

import { linkTaleSpireCampaignAction, syncTaleSpireCampaignAction } from "@backend/actions/talespire";
import { TS_READY_EVENT, isSymbiote, taleSpireCampaign } from "@backend/lib/talespire";
import { Button } from "@frontend/components/atoms/Button";
import { Icon } from "@frontend/components/atoms/Icon";

const DISMISS_KEY = "arca:ts-link-dismissed:";

function dismissedFor(talespireId: string): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY + talespireId) === "1";
  } catch {
    return false;
  }
}

type Offer = { talespireId: string; talespireName: string; arcaName: string };

/**
 * Inside TaleSpire: put the player in the Arca campaign linked to the
 * TaleSpire campaign they have open, without touching the campaign menu.
 *
 * Runs once TaleSpire's API is up (it can initialise after this mounts, hence
 * the ready event). If no campaign is linked yet and this player is the GM,
 * offers to link the one they are in. Renders nothing in a browser tab.
 */
export function TaleSpireCampaignSync() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [phase, setPhase] = useState<"idle" | "linking" | "linked">("idle");
  const [error, setError] = useState<string | null>(null);
  const synced = useRef<string | null>(null);

  useEffect(() => {
    const attempt = () => {
      if (!isSymbiote()) return;
      void taleSpireCampaign().then(async (here) => {
        if (!here || synced.current === here.id) return;
        synced.current = here.id;
        const result = await syncTaleSpireCampaignAction(here.id);
        if (result.kind === "switched") {
          // A full load, not a client navigation: every cached screen belongs
          // to the campaign we just left, and refreshing the current address
          // would ask for a container that campaign does not have.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate full reload, see above
          window.location.assign("/");
        } else if (result.kind === "offer-link" && !dismissedFor(here.id)) {
          setOffer({ talespireId: here.id, talespireName: here.name, arcaName: result.arcaCampaignName });
        }
      });
    };
    attempt();
    window.addEventListener(TS_READY_EVENT, attempt);
    return () => window.removeEventListener(TS_READY_EVENT, attempt);
  }, []);

  if (!offer) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY + offer.talespireId, "1");
    } catch {
      // Storage blocked: the offer just closes for now.
    }
    setOffer(null);
  };

  const link = () => {
    setPhase("linking");
    setError(null);
    void linkTaleSpireCampaignAction(offer.talespireId).then((result) => {
      if (result.ok) {
        setPhase("linked");
        window.setTimeout(() => setOffer(null), 2500);
      } else {
        setPhase("idle");
        setError(result.error ?? "Could not link this campaign.");
      }
    });
  };

  return (
    <div
      role="region"
      aria-label="Link to TaleSpire"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface2 px-3 py-1.5 text-sm text-text md:px-4"
    >
      <Icon name="d20" size={14} className="shrink-0 text-primary" />
      {phase === "linked" ? (
        <p className="min-w-0 flex-1">
          Linked. Opening Arca in “{offer.talespireName}” now comes straight to {offer.arcaName}.
        </p>
      ) : (
        <>
          <p className="min-w-0 flex-1">
            Link the TaleSpire campaign “{offer.talespireName}” to <strong>{offer.arcaName}</strong>?
            Everyone opening Arca in it will land here.
            {error ? <span className="ml-2 text-danger">{error}</span> : null}
          </p>
          <Button size="sm" variant="primary" onClick={link} disabled={phase === "linking"}>
            Link
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </>
      )}
    </div>
  );
}
