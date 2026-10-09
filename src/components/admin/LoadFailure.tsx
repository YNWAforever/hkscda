import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { useSharedAdminCopy } from "./i18n/copy";
import { sharedUiCopy } from "./sharedUiCopy";

/**
 * Shared failure state for admin lists, panels and KPI tiles.
 *
 * The admin surfaces grew the same defect independently: a query's `data` is
 * destructured, `isError` is never read, and a `?? []` / `?? { …: 0 }` default
 * stands in for the missing result. A failed load then renders as a legitimately
 * empty table or a zero KPI, so an outage is indistinguishable from "there is
 * nothing here". That is the literal symptom the 2026-09-11 audit recorded
 * against the volunteer page: the UI showed zero records while the database held
 * 12 activities and 5 registrations.
 *
 * The rule these primitives encode: a failure is shown as a failure. It is never
 * rendered as empty, and never as zero.
 */

/**
 * What a KPI shows when its source failed to load.
 *
 * Not `0`: zero is a real, meaningful figure to an operator deciding whether
 * there is work waiting, and showing it for a failed fetch is a lie that reads
 * as "all clear".
 */
export const STAT_UNAVAILABLE = "—";

/**
 * A short, stable reference an operator can quote when reporting a failure.
 *
 * Derived from the error text rather than randomly generated so the same fault
 * produces the same reference across a retry, and two operators hitting one
 * outage report one reference. It is deliberately not the raw message: error
 * text can carry table names, row contents or provider detail that does not
 * belong on an operator's screen.
 */
export function errorReference(error: unknown): string {
  const text =
    error instanceof Error
      ? `${error.name}:${error.message}` // admin-error-render-ok: hashed into the reference, never shown
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error) ?? "unknown";
            } catch {
              return "unknown";
            }
          })();

  // FNV-1a: small, dependency-free, and stable across reloads.
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 6).toUpperCase();
}

export type LoadFailureProps = {
  /** The caught error. Its text is never rendered; only a reference is shown. */
  error: unknown;
  /** Re-runs the failed query. Omit only when no retry is possible. */
  onRetry?: () => void;
  /** Overrides the default "Could not load" heading with something more specific. */
  title?: ReactNode;
  /** True while the retry is in flight, so the control cannot be double-fired. */
  retrying?: boolean;
  className?: string;
};

export function LoadFailure({
  error,
  onRetry,
  title,
  retrying = false,
  className,
}: LoadFailureProps) {
  const copy = useSharedAdminCopy(sharedUiCopy).loadFailure;
  const reference = errorReference(error);
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-[var(--color-border)] px-3 py-8 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-[var(--color-text)]">
        {title === undefined ? copy.title : title}
      </p>
      <p className="text-xs text-[var(--color-text-muted)]">
        {copy.guidance} <span className="font-mono">{reference}</span>
      </p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? copy.retrying : copy.retry}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Renders a KPI figure, or the unavailable marker when its source failed.
 *
 * `failed` is deliberately a required prop rather than inferred from a nullish
 * value: "we could not load this" and "this is genuinely zero" are different
 * facts, and a caller that has not decided which it is has not finished handling
 * the error.
 */
export function StatFigure({
  value,
  failed,
  loading = false,
}: {
  value: ReactNode;
  failed: boolean;
  loading?: boolean;
}) {
  const copy = useSharedAdminCopy(sharedUiCopy).loadFailure;
  if (loading) {
    return (
      <span className="inline-block h-6 w-12 animate-pulse rounded bg-[var(--color-surface-2)]" />
    );
  }
  if (failed) {
    return (
      <span className="text-[var(--color-text-muted)]" title={copy.title}>
        {STAT_UNAVAILABLE}
      </span>
    );
  }
  return <>{value}</>;
}
