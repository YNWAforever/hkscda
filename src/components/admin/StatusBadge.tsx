import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { statusDisplayName } from "./adminPageCopy";
import { useAdminLanguage } from "./adminI18n";
import { Badge } from "../ui/badge";

// Canonical status-colour → CSS-variable dot mapping. Single source of truth for
// the coordinator status palette; replaces the per-file `STATUS_DOT_CLASSES`
// copies that were duplicated across CaseList, CaseDetail, MatchPanel,
// AdopterDetail, TaskPanel and AnimalPipeline.
const STATUS_DOT_CLASSES: Record<string, string> = {
  amber: "bg-[var(--color-warning)]",
  blue: "bg-[var(--color-panel)]",
  coral: "bg-[var(--color-primary)]",
  cyan: "bg-[var(--color-lavender-deep)]",
  green: "bg-[var(--color-success)]",
  indigo: "bg-[var(--color-panel-2)]",
  purple: "bg-[var(--color-secondary)]",
  red: "bg-[var(--color-error)]",
  slate: "bg-[var(--color-text-muted)]",
};

/** Resolve a coordinator status colour key to its dot background class. */
function statusDotClass(color: string): string {
  return STATUS_DOT_CLASSES[color] ?? "bg-[var(--color-border)]";
}

const PILL_BASE =
  "gap-1.5 border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]";

type StatusLike = {
  color: string;
  labelZh: string;
  labelEn?: string | null;
};

/**
 * Consolidated status pill for coordinator statuses: a colour dot followed by
 * the Chinese label and (optionally) a muted English label. This is the shared
 * replacement for the hand-copied `StatusChip` in the adoption views.
 */
export function StatusBadge({ status, className }: { status: StatusLike; className?: string }) {
  const { language } = useAdminLanguage();

  return (
    <Badge variant="outline" className={cn(PILL_BASE, className)}>
      <span
        className={cn("h-2 w-2 rounded-full", statusDotClass(status.color))}
        aria-hidden="true"
      />
      <span>{statusDisplayName(status, language)}</span>
    </Badge>
  );
}

// Semantic tones for statuses that are not coordinator statuses (e.g. the
// animal lifecycle: available / adopted / fostered). Keeps every status pill on
// the same CSS-variable palette instead of one-off Tailwind colour utilities.
const TONE_DOT_CLASSES = {
  success: "bg-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]",
  danger: "bg-[var(--color-error)]",
  info: "bg-[var(--color-lavender-deep)]",
  neutral: "bg-[var(--color-text-muted)]",
} as const;

export type StatusTone = keyof typeof TONE_DOT_CLASSES;

/**
 * Tone-based status pill for non-coordinator statuses. Shares the same visual
 * shell as {@link StatusBadge} so every list page reads consistently.
 */
export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(PILL_BASE, className)}>
      <span className={cn("h-2 w-2 rounded-full", TONE_DOT_CLASSES[tone])} aria-hidden="true" />
      <span>{children}</span>
    </Badge>
  );
}
