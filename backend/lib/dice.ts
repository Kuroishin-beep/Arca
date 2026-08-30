/**
 * Dice notation parser — SCOPE.md S2 (stretch).
 *
 * Parses standard notation and reports WHERE it failed, not merely that it
 * did. The parse preview built on this is the point of the screen: at a real
 * table an unintended roll cannot be taken back, so you see what will be thrown
 * before it is thrown.
 *
 * Supported: `d20`, `2d6`, `1d8+2`, `4d6kh3`, `2d20kl1`, `d100-5`, and chains
 * such as `2d6+1d4+3`.
 */

export interface DiceTerm {
  kind: "dice" | "modifier";
  /** Text as written, for the preview chips. */
  raw: string;
  /** Dice terms only. */
  count?: number;
  sides?: number;
  /** `kh3` keeps the highest 3, `kl1` the lowest 1. */
  keep?: { mode: "highest" | "lowest"; n: number };
  /** Modifier terms only; already signed. */
  value?: number;
  /** How the term reads in plain words, for the preview. */
  description: string;
  sign: 1 | -1;
}

export type ParseResult =
  | { ok: true; terms: DiceTerm[]; min: number; max: number; normalised: string }
  | { ok: false; message: string; position: number };

const TERM = /^(\d*)d(\d+)(?:k([hl])(\d+))?$/i;

export function parseDiceNotation(input: string): ParseResult {
  const text = input.trim();
  if (text === "") {
    return { ok: false, message: "Enter some dice notation.", position: 0 };
  }

  // Split on + / - while keeping the operator, tracking offsets so an error can
  // name a column rather than shrugging.
  const terms: DiceTerm[] = [];
  let cursor = 0;
  let sign: 1 | -1 = 1;
  let buffer = "";
  let bufferStart = 0;

  const flush = (endIndex: number): ParseResult | null => {
    const chunk = buffer.trim();
    if (chunk === "") {
      return {
        ok: false,
        message: `Nothing to roll before position ${endIndex + 1}.`,
        position: endIndex,
      };
    }

    const dice = TERM.exec(chunk);
    if (dice) {
      const count = dice[1] === "" ? 1 : Number(dice[1]);
      const sides = Number(dice[2]);
      if (count < 1 || count > 100) {
        return {
          ok: false,
          message: "Roll between 1 and 100 dice.",
          position: bufferStart,
        };
      }
      if (sides < 2 || sides > 1000) {
        return {
          ok: false,
          message: "A die needs between 2 and 1000 sides.",
          position: bufferStart,
        };
      }

      let keep: DiceTerm["keep"];
      if (dice[3] && dice[4]) {
        const n = Number(dice[4]);
        if (n < 1 || n > count) {
          return {
            ok: false,
            message: `Cannot keep ${n} of ${count} dice.`,
            position: bufferStart,
          };
        }
        keep = { mode: dice[3].toLowerCase() === "h" ? "highest" : "lowest", n };
      }

      terms.push({
        kind: "dice",
        raw: chunk,
        count,
        sides,
        keep,
        sign,
        description: describeDice(count, sides, keep),
      });
      return null;
    }

    if (/^\d+$/.test(chunk)) {
      terms.push({
        kind: "modifier",
        raw: chunk,
        value: Number(chunk) * sign,
        sign,
        description: "flat modifier",
      });
      return null;
    }

    return {
      ok: false,
      message: `Cannot read "${chunk}". Try something like 2d6+3.`,
      position: bufferStart,
    };
  };

  while (cursor < text.length) {
    const ch = text[cursor]!;
    if (ch === "+" || ch === "-") {
      if (buffer.trim() === "") {
        return {
          ok: false,
          message: `Unexpected "${ch}" at position ${cursor + 1}.`,
          position: cursor,
        };
      }
      const err = flush(cursor);
      if (err) return err;
      sign = ch === "-" ? -1 : 1;
      buffer = "";
      bufferStart = cursor + 1;
    } else {
      if (buffer === "") bufferStart = cursor;
      buffer += ch;
    }
    cursor += 1;
  }

  const err = flush(text.length - 1);
  if (err) return err;
  if (terms.length === 0) {
    return { ok: false, message: "Enter some dice notation.", position: 0 };
  }

  let min = 0;
  let max = 0;
  for (const term of terms) {
    if (term.kind === "modifier") {
      min += term.value ?? 0;
      max += term.value ?? 0;
      continue;
    }
    const rolled = term.keep?.n ?? term.count ?? 0;
    min += term.sign * rolled * 1;
    max += term.sign * rolled * (term.sides ?? 0);
  }
  if (min > max) [min, max] = [max, min];

  return { ok: true, terms, min, max, normalised: normalise(terms) };
}

function describeDice(
  count: number,
  sides: number,
  keep: DiceTerm["keep"],
): string {
  const words = ["", "one", "two", "three", "four", "five", "six"];
  const spelled = count <= 6 ? words[count] : String(count);
  const base = `${spelled} ${sides}-sided ${count === 1 ? "die" : "dice"}`;
  if (!keep) return base;
  return `${base}, keep ${keep.mode} ${keep.n}`;
}

function normalise(terms: DiceTerm[]): string {
  return terms
    .map((t, i) => {
      const op = t.sign === -1 ? "-" : i === 0 ? "" : "+";
      return `${op}${t.raw}`;
    })
    .join("");
}
