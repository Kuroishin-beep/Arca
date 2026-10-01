import type { ReactNode } from "react";

import type { ContainerType } from "@backend/domain/types";

import { Icon, type IconName } from "./Icon";

export type ChipTone =
  | "neutral"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

/** Every `-weak` background is a flat solid tint, not an opacity layer, so a
 *  chip renders identically over any of the three surface levels. */
const TONE: Record<ChipTone, string> = {
  neutral: "bg-surface2 text-muted",
  primary: "bg-primary-weak text-primary",
  accent: "bg-accent-weak text-accent",
  success: "bg-success-weak text-success",
  warning: "bg-warning-weak text-warning",
  danger: "bg-danger-weak text-danger",
  info: "bg-info-weak text-info",
};

export function Chip({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-xs ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * TagChip
 * ------------------------------------------------------------------ */

/** The tags a Dragonbane table actually uses, each given its own tone so the
 *  colour carries meaning across every screen: a weapon is gold wherever it
 *  appears. */
const KNOWN_TAG_TONES: Readonly<Record<string, ChipTone>> = {
  weapon: "primary",
  armour: "info",
  armor: "info",
  consumable: "success",
  ammunition: "warning",
  treasure: "accent",
  magic: "accent",
  gear: "neutral",
};

/** Tags a campaign invents get a tone too — stable, from the tag's own text,
 *  so "quest" is the same colour on every reload rather than whichever tone
 *  was free. Danger is left out: red reads as an error, not a category. */
const FALLBACK_TONES: readonly ChipTone[] = ["info", "accent", "warning", "primary", "success"];

export function tagTone(tag: string): ChipTone {
  const key = tag.trim().toLowerCase();
  const known = KNOWN_TAG_TONES[key];
  if (known) return known;
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_TONES[hash % FALLBACK_TONES.length]!;
}

export function TagChip({ tag, className = "" }: { tag: string; className?: string }) {
  return (
    <Chip tone={tagTone(tag)} className={className}>
      {tag}
    </Chip>
  );
}

/* ------------------------------------------------------------------ *
 * ContainerBadge
 * ------------------------------------------------------------------ */

const CONTAINER: Record<
  ContainerType,
  { dot: string; text: string; icon: IconName; label: string }
> = {
  character: {
    dot: "bg-c-character",
    text: "text-c-character",
    icon: "pack",
    label: "Pack",
  },
  party: {
    dot: "bg-c-party",
    text: "text-c-party",
    icon: "wagon",
    label: "Shared",
  },
  world: {
    dot: "bg-c-world",
    text: "text-c-world",
    icon: "chest",
    label: "World",
  },
};

/**
 * Container type is the thing players misread most often ("was that ours or
 * mine?"), so it gets a fixed hue everywhere it appears — but ALWAYS with an
 * icon and a text label too. The colour is a shortcut, never the only signal.
 */
export function ContainerDot({ type }: { type: ContainerType }) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${CONTAINER[type].dot}`}
      aria-hidden="true"
    />
  );
}

export function ContainerIcon({
  type,
  size = 15,
  className = "",
}: {
  type: ContainerType;
  size?: number;
  className?: string;
}) {
  return <Icon name={CONTAINER[type].icon} size={size} className={className} />;
}

export function ContainerBadge({ type }: { type: ContainerType }) {
  const tone: ChipTone =
    type === "party" ? "accent" : type === "character" ? "primary" : "neutral";
  return <Chip tone={tone}>{CONTAINER[type].label}</Chip>;
}

export const containerLabel = (type: ContainerType) => CONTAINER[type].label;
