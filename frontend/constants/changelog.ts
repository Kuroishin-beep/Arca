/**
 * What changed, newest first — shown in the banner along the top of the app
 * (the newest entry) and in full at /changelog.
 *
 * Written for the table, not for developers: what a player or GM will notice.
 * Add an entry at the TOP with a new, unique `id` when a release changes
 * something visible; the banner reappears for everyone who dismissed the last
 * one, because dismissal is remembered per entry id.
 */
export interface ChangelogEntry {
  /** Unique and stable — what a dismissal is remembered against. */
  id: string;
  /** ISO date, shown as written. */
  date: string;
  title: string;
  changes: string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: "2026-11-16-talespire-accounts",
    date: "2026-11-16",
    title: "Plain links, smoother TaleSpire, password help",
    changes: [
      "Links are just the name now — /c/guild-stash — and old links still work, even after a rename.",
      "Inside TaleSpire, Arca opens straight into your campaign once your GM links the two.",
      "You stay signed in while you keep using Arca.",
      "Forgot your password? Ask from the sign-in screen and your GM can reset it.",
      "Change your password from your name in the top bar.",
      "An installer for the TaleSpire Symbiote.",
    ],
  },
  {
    id: "2026-11-16-sheet-advancement",
    date: "2026-11-16",
    title: "Advancement, kin and a roomier sheet",
    changes: [
      "Skills: an Advancement button walks every marked skill — roll to beat the level, then Raised +1 or No change.",
      "Skill levels can be edited with Edit levels; skill names no longer get cut off.",
      "Kin is a dropdown of every kin, plus Custom… for your own.",
      "Heroic abilities and spells read plainly; the pencil opens one for editing.",
      "The sheet uses the full width, and the dice roller is on the sheet.",
      "Dialogs keep what you typed when a save is refused.",
    ],
  },
  {
    id: "2026-11-16-urls-theme",
    date: "2026-11-16",
    title: "Readable links, TaleSpire colours, new icon",
    changes: [
      "Links read like /c/party-wagon-1a2b3c4d; old links still work.",
      "Inside TaleSpire, Arca uses TaleSpire's colours and font.",
      "A new app icon.",
    ],
  },
  {
    id: "2026-11-15-inventory-slots",
    date: "2026-11-15",
    title: "Inventory slots and tiny items",
    changes: [
      "The sheet counts inventory slots from STR; worn armour, weapons at hand and tiny items take none.",
      "Tag an item tiny to list it under Tiny items.",
    ],
  },
  {
    id: "2026-11-15-dragonbane-sheet",
    date: "2026-11-15",
    title: "A Dragonbane character sheet, and TaleSpire dice",
    changes: [
      "Heroic abilities, armour and helmet, money, rest, and weapons at hand.",
      "Inside TaleSpire, the d20 beside a skill puts the roll in your dice tray.",
      "Container pages load much faster.",
    ],
  },
];

export const LATEST_CHANGE: ChangelogEntry | undefined = CHANGELOG[0];
