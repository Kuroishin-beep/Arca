/*
 * Arca's half of the TaleSpire handshake. TaleSpire injects this into the
 * deployed app (manifest "extras") alongside its own `TS` API.
 *
 * The manifest subscribes to events by GLOBAL FUNCTION NAME, and they can fire
 * before the app has hydrated — so this file owns the named handlers and
 * re-emits each as a DOM event the app listens for whenever it is ready
 * (backend/lib/talespire.ts). It must stay a plain script: no modules, no
 * build step, and nothing that assumes the app is there yet.
 */
(function () {
  var root = document.documentElement;
  // Lets CSS tighten the layout for the side panel without waiting for React.
  root.setAttribute("data-symbiote", "talespire");

  window.arcaOnSymbioteState = function (event) {
    if (!event || event.kind !== "hasInitialized") return;
    root.setAttribute("data-symbiote-ready", "true");
    window.dispatchEvent(new CustomEvent("arca:ts-ready"));
  };
})();
