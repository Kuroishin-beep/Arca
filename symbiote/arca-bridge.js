/*
 * Arca's half of the TaleSpire handshake. TaleSpire injects this into the
 * deployed app (manifest "extras") alongside its own `TS` API.
 *
 * The manifest subscribes to events by GLOBAL FUNCTION NAME, and they can fire
 * before the app has hydrated — so this file owns the named handlers and
 * re-emits each as a DOM event the app listens for whenever it is ready
 * (backend/lib/talespire.ts). It must stay a plain script: no modules, no
 * build step, and nothing that assumes the app — or even <html> — is there yet.
 */
(function () {
  function root() {
    return document.documentElement;
  }

  // TaleSpire's colours (globals.css, `data-ts-colors`), only once its
  // "colorStyles" extra has actually defined them. Re-checked at each stage of
  // loading, because when the extras land relative to the page is not
  // specified, and re-applied in case hydrating <html> drops the attribute.
  function mark() {
    var html = root();
    if (!html) return;
    html.setAttribute("data-symbiote", "talespire");
    var probe = getComputedStyle(html).getPropertyValue("--ts-background-primary");
    if (probe && probe.trim() !== "") html.setAttribute("data-ts-colors", "");
  }

  mark();
  document.addEventListener("DOMContentLoaded", mark);
  window.addEventListener("load", mark);

  window.arcaOnSymbioteState = function (event) {
    if (!event || event.kind !== "hasInitialized") return;
    mark();
    if (root()) root().setAttribute("data-symbiote-ready", "true");
    window.dispatchEvent(new CustomEvent("arca:ts-ready"));
  };
})();
