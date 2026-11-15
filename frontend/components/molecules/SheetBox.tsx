/**
 * The printed Dragonbane sheet's look, in tokens.
 *
 * The paper sheet frames every block in a ruled box with a small-caps label,
 * so a glance finds "Hit points" or "Skills" by shape before reading. These two
 * class strings are that frame: a heavy outer rule with a thin inner one (the
 * double line the sheet prints), and an uppercase serif label.
 *
 * Constants rather than a wrapper component because every section already owns
 * its own header row (hints, buttons); they only need to look the same.
 */
export const SHEET_BOX =
  "rounded-sm border-2 border-border-strong bg-surface p-4 shadow-[inset_0_0_0_3px_var(--color-surface),inset_0_0_0_4px_var(--color-border)]";

export const SHEET_HEADING =
  "font-serif text-base font-bold uppercase tracking-[0.14em] text-text";
