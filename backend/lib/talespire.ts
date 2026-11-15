/**
 * The ONLY module that knows TaleSpire exists.
 *
 * Everything else imports from here, which buys two things:
 *
 *   1. The app runs in an ordinary browser tab, where every call below is a
 *      no-op. That is the only sane way to develop a Symbiote — you are not
 *      launching a virtual tabletop to check a padding change.
 *   2. When the real Symbiote API surprises us, the blast radius is this file.
 *
 * ## How Arca gets the API
 *
 * The Symbiote package in `symbiote/` points TaleSpire's web view straight at
 * the deployed app (`entryPoint` is our https URL — no iframe). TaleSpire then
 * injects `TS` into the page, plus `symbiote/arca-bridge.js`, which defines the
 * named global handlers the manifest subscribes to and re-emits them as the
 * DOM events below. That indirection exists because TaleSpire calls handlers
 * by global NAME and can fire before React has hydrated.
 *
 * API reference: https://symbiote-docs.talespire.com/api_doc_v0_1.md.html
 */

/** One die group handed to TaleSpire's tray: a label and a roll string. */
export interface RollDescriptor {
  name: string;
  roll: string;
}

/** The subset of the Symbiote API v0.1 Arca uses. Every member optional,
 *  because a missing one has to degrade, not throw. */
interface TaleSpireApi {
  dice?: {
    putDiceInTray?: (
      descriptors: RollDescriptor[],
      quietResults: boolean,
    ) => Promise<string>;
    evaluateDiceResultsGroup?: (group: unknown) => Promise<number>;
  };
  players?: {
    whoAmI?: () => Promise<{ id: string; name: string }>;
  };
  campaigns?: {
    whereAmI?: () => Promise<{ id: string; name: string }>;
  };
}

declare global {
  interface Window {
    TS?: TaleSpireApi;
  }
}

/** Fired by `symbiote/arca-bridge.js` once TaleSpire's API has initialised. */
export const TS_READY_EVENT = "arca:ts-ready";

/** True only inside TaleSpire's embedded browser. */
export function isSymbiote(): boolean {
  return typeof window !== "undefined" && typeof window.TS === "object";
}

/**
 * Dice notation as TaleSpire's tray wants it: lower-case `d`, and an explicit
 * count, so "D6" → "1d6" and "2D6+1" → "2d6+1". Dragonbane prints dice upper
 * case; the tray rejects a bare "d6" group as `noDiceSpecified`.
 */
export function toTrayNotation(notation: string): string {
  const compact = notation.replace(/\s+/g, "").toLowerCase();
  return compact.replace(/(^|[+-])d(\d)/g, "$11d$2");
}

/**
 * Put dice in TaleSpire's own tray, labelled.
 *
 * Arca never rolls dice itself. TaleSpire does, on the table, where everyone
 * can see them — the result being public and physical is the point.
 *
 * Returns `false` when there is no bridge, or TaleSpire refused the roll (not
 * on a board, an unsupported die), so callers can say so rather than
 * pretending the roll happened.
 */
export async function rollDice(
  notation: string,
  label?: string,
): Promise<boolean> {
  if (!isSymbiote()) return false;
  const put = window.TS?.dice?.putDiceInTray;
  if (typeof put !== "function") return false;
  const roll = toTrayNotation(notation);
  try {
    await put([{ name: label ?? roll, roll }], false);
    return true;
  } catch {
    // TaleSpire rejects with a cause (notInBoard, unsupportedSidesCount…);
    // the caller's `false` is what the player sees, so nothing is lost here.
    return false;
  }
}

/** The player name TaleSpire knows this client by, when it offers one. */
export async function symbioteName(): Promise<string | undefined> {
  if (!isSymbiote()) return undefined;
  const whoAmI = window.TS?.players?.whoAmI;
  if (typeof whoAmI !== "function") return undefined;
  try {
    return (await whoAmI()).name;
  } catch {
    // Not in a campaign yet, or the API is still initialising: no name to show.
    return undefined;
  }
}

/**
 * The TaleSpire campaign this client is in — what an Arca campaign is linked
 * to. `undefined` outside TaleSpire, before its API has initialised, or when
 * TaleSpire has no campaign open.
 */
export async function taleSpireCampaign(): Promise<{ id: string; name: string } | undefined> {
  if (!isSymbiote()) return undefined;
  const whereAmI = window.TS?.campaigns?.whereAmI;
  if (typeof whereAmI !== "function") return undefined;
  try {
    const here = await whereAmI();
    return here && typeof here.id === "string" && here.id !== "" ? here : undefined;
  } catch {
    // Not in a campaign (TaleSpire's main menu): nothing to link to.
    return undefined;
  }
}

/** Fired by `symbiote/arca-bridge.js` for each TaleSpire dice result. */
export const TS_ROLL_EVENT = "arca:ts-roll";

interface RollResultsEvent {
  kind: "rollResults" | "rollRemoved";
  payload: { rollId: string; resultsGroups?: unknown[] };
}

/**
 * Throw `count` d20s from TaleSpire's tray, labelled, and wait for what they
 * came up as — one number per die, in order. `null` outside TaleSpire, if
 * TaleSpire refuses the roll, if the player clears the tray instead of
 * throwing, or after `timeoutMs` (the dice are thrown by hand, so it waits).
 *
 * Each die is its own group so a bane's extra d20 comes back as its own
 * value rather than summed into the first.
 */
export async function rollD20sInTaleSpire(
  count: number,
  label: string,
  timeoutMs = 120_000,
): Promise<number[] | null> {
  if (!isSymbiote()) return null;
  const dice = window.TS?.dice;
  if (typeof dice?.putDiceInTray !== "function") return null;
  const evaluate = dice.evaluateDiceResultsGroup;
  if (typeof evaluate !== "function") return null;

  // Listen before throwing, so a fast result cannot arrive unheard.
  let resolveEvent: (event: RollResultsEvent | null) => void = () => undefined;
  const arrived = new Promise<RollResultsEvent | null>((resolve) => {
    resolveEvent = resolve;
  });
  let rollId: string | null = null;
  const pending: RollResultsEvent[] = [];
  const onRoll = (e: Event) => {
    const detail = (e as CustomEvent<RollResultsEvent>).detail;
    if (rollId === null) pending.push(detail);
    else if (detail?.payload?.rollId === rollId) resolveEvent(detail);
  };
  window.addEventListener(TS_ROLL_EVENT, onRoll);
  const timer = window.setTimeout(() => resolveEvent(null), timeoutMs);

  try {
    const descriptors = Array.from({ length: count }, () => ({ name: label, roll: "1d20" }));
    rollId = await dice.putDiceInTray(descriptors, false);
    const early = pending.find((p) => p?.payload?.rollId === rollId);
    if (early) resolveEvent(early);

    const event = await arrived;
    if (!event || event.kind !== "rollResults" || !event.payload.resultsGroups) return null;
    const values = await Promise.all(event.payload.resultsGroups.map((g) => evaluate(g)));
    return values.every((v) => Number.isFinite(v)) ? values : null;
  } catch {
    // Refused (not on a board, rate limited): the caller says so.
    return null;
  } finally {
    window.clearTimeout(timer);
    window.removeEventListener(TS_ROLL_EVENT, onRoll);
  }
}
