import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

const tones = {
  neutral: "bg-[var(--color-surface-offset)] text-[var(--color-text)]",
  info: "bg-[var(--color-info-highlight)] text-[var(--color-info)]",
  success: "bg-[var(--color-success-highlight)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-highlight)] text-[var(--color-warning)]",
  error: "bg-[var(--color-error-highlight)] text-[var(--color-error)]",
} as const;

export function PublicStatusBadge({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof tones;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded px-2 py-1 text-xs font-bold",
        tones[tone],
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
