import type { Principal } from "@/domain/view";

export type SyncStatus = "idle" | "syncing" | "error";

const SYNC: Record<
  SyncStatus,
  { dot: string; text: string; bg: string; border: string; label: string }
> = {
  idle: {
    dot: "bg-success",
    text: "text-success",
    bg: "bg-success-weak",
    border: "border-border",
    label: "Synced",
  },
  syncing: {
    dot: "bg-info",
    text: "text-info",
    bg: "bg-info-weak",
    border: "border-border",
    label: "Syncing…",
  },
  error: {
    dot: "bg-danger",
    text: "text-danger",
    bg: "bg-danger-weak",
    border: "border-danger",
    label: "Offline",
  },
};

/**
 * Visible on every screen. A player needs to know whether what they are looking
 * at is true right now, and stale data that is LABELLED is far safer at a table
 * than stale data that is hidden (SCOPE.md M13).
 */
export function SyncPill({
  status = "idle",
  lastSyncedAt,
  className = "",
}: {
  status?: SyncStatus;
  lastSyncedAt?: Date;
  className?: string;
}) {
  const tone = SYNC[status];
  return (
    <div
      data-status={status}
      title={
        lastSyncedAt
          ? `Last synced ${lastSyncedAt.toLocaleTimeString()}`
          : undefined
      }
      className={`flex shrink-0 items-center gap-2 rounded-sm border px-2 py-1 ${tone.bg} ${tone.border} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
      <span className={`text-xs font-medium ${tone.text}`}>{tone.label}</span>
    </div>
  );
}

/** Initials, not a photo. There are no avatars to load and no requests to make
 *  inside the panel. */
export function Avatar({
  name,
  size = 28,
}: {
  name: string;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-primary-weak text-xs font-bold text-primary"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function UserBadge({ principal }: { principal: Principal }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Avatar name={principal.displayName} />
      <span className="hidden text-xs font-medium text-muted md:inline">
        {principal.displayName} · {principal.role === "gm" ? "GM" : "Player"}
      </span>
    </div>
  );
}
