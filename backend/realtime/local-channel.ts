/**
 * In-process fan-out for fixture mode.
 *
 * This exists so that `npm run dev` with no database still demonstrates M8:
 * two tabs against the same dev server do see each other's changes. That is
 * genuinely useful while building the UI.
 *
 * It is NOT a production transport, and the limitation is not incidental —
 * SCOPE.md §4.1 states that Vercel functions are stateless and short-lived, so
 * two invocations share no memory and this would silently deliver nothing.
 * `realtimeKind()` therefore selects it only when DATABASE_URL is absent, which
 * is the same condition that puts the app on in-memory fixtures anyway.
 */
import { EventEmitter } from "node:events";

import type { ArcaEvent, RealtimeTransport } from "./index";

const EMITTER_KEY = Symbol.for("arca.realtime.local");

/**
 * Cached on `globalThis` for the same reason the Drizzle pool is: Next's dev
 * server re-evaluates modules on every edit, and a fresh emitter per evaluation
 * would drop every existing subscriber on save.
 */
function emitter(): EventEmitter {
  const g = globalThis as unknown as Record<symbol, EventEmitter | undefined>;
  let e = g[EMITTER_KEY];
  if (!e) {
    e = new EventEmitter();
    // One listener per connected tab, and a table can have more than the
    // default ten before Node starts warning about a leak that is not one.
    e.setMaxListeners(100);
    g[EMITTER_KEY] = e;
  }
  return e;
}

export const localTransport: RealtimeTransport = {
  name: "local",

  async publish(campaignId, event) {
    emitter().emit(campaignId, event);
  },

  async subscribe(campaignId, onEvent) {
    const handler = (event: ArcaEvent) => onEvent(event);
    emitter().on(campaignId, handler);
    return async () => {
      emitter().off(campaignId, handler);
    };
  },
};
