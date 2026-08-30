/**
 * The ONLY module that knows TaleSpire exists.
 *
 * Everything else imports from here, which buys two things:
 *
 *   1. The app runs in an ordinary browser tab, where every call below is a
 *      no-op. That is the only sane way to develop a Symbiote — you are not
 *      launching a virtual tabletop to check a padding change.
 *   2. When the real Symbiote API surprises us (SCOPE.md §10 R2), the blast
 *      radius is this file.
 */

/** The subset of the Symbiote API Arca actually uses. */
interface TaleSpireBridge {
  dice?: {
    roll?: (notation: string, label?: string) => Promise<unknown> | unknown;
  };
  getName?: () => string | undefined;
}

declare global {
  interface Window {
    TS?: TaleSpireBridge;
  }
}

/** True only inside TaleSpire's embedded browser. */
export function isSymbiote(): boolean {
  return typeof window !== "undefined" && typeof window.TS === "object";
}

/**
 * Fire a roll into TaleSpire's own dice roller.
 *
 * Arca never rolls dice itself. TaleSpire does, on the table, where everyone
 * can see them — the result being public and physical is the entire point
 * (SCOPE.md S2).
 *
 * Returns `false` when there is no bridge, so callers can disable the control
 * and say why rather than pretending the roll happened.
 */
export async function rollDice(
  notation: string,
  label?: string,
): Promise<boolean> {
  if (!isSymbiote()) return false;
  const roll = window.TS?.dice?.roll;
  if (typeof roll !== "function") return false;
  await roll(notation, label);
  return true;
}

/** The display name TaleSpire knows this client by, when it offers one. */
export function symbioteName(): string | undefined {
  if (!isSymbiote()) return undefined;
  return window.TS?.getName?.();
}
