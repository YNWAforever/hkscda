import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "../ui/button";
import { useSharedAdminCopy } from "./i18n/copy";
import { sharedUiCopy } from "./sharedUiCopy";

type TablePagerProps = {
  page: number;
  pageSize: number;
  /** Total matching rows reported by the API, not the length of the current page. */
  total: number | undefined;
  onPageChange: (page: number) => void;
  /** Disables both controls while a fetch is in flight. */
  busy?: boolean;
  /** Describes what is being paged, for the screen-reader label. */
  label?: string;
  /**
   * True when the query that produces `total` errored. An unknown total
   * normally means "assume more, don't strand the operator" (see below), but
   * a failed load means the opposite: we don't know if there's more AND
   * something is wrong, so Next must not invite paging into another failure.
   */
  failed?: boolean;
};

/**
 * Page controls for the admin tables.
 *
 * Several admin screens requested a paginated API (pageSize=25) and then never
 * rendered controls, so rows past the first page existed but were unreachable —
 * a table that looks complete while silently hiding data is worse than one that
 * admits it. Nine screens had each grown their own copy of this markup; new
 * screens should use this instead of a tenth.
 */
export function TablePager({
  page,
  pageSize,
  total,
  onPageChange,
  busy,
  label,
  failed = false,
}: TablePagerProps) {
  const copy = useSharedAdminCopy(sharedUiCopy).tablePager;
  // Without a total we can't know whether a next page exists. Assume there is
  // one whenever the current page came back full — stopping early would hide
  // rows, which is the bug this component exists to fix. `failed` overrides
  // that assumption: a total that's missing because the load errored is not
  // "assume more", it's "unknown, and don't page forward into another error".
  const knownTotal = typeof total === "number";
  const lastPage = knownTotal ? Math.max(1, Math.ceil(total / pageSize)) : undefined;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = knownTotal ? Math.min(page * pageSize, total) : page * pageSize;

  const hasPrevious = page > 1;
  const hasNext = failed ? false : knownTotal ? page < (lastPage ?? 1) : true;

  // A single page of results needs no controls.
  if (knownTotal && (lastPage ?? 1) <= 1) return null;

  return (
    <nav
      aria-label={copy.navLabel(label ?? copy.defaultLabel)}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3"
    >
      <p aria-live="polite" className="text-xs tabular-nums text-[var(--color-text-muted)]">
        {knownTotal ? copy.range(first, last, total) : copy.rangeOfUnknownTotal(page, first, last)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasPrevious || busy}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
          {copy.previous}
        </Button>
        <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
          {knownTotal ? `${page} / ${lastPage}` : page}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasNext || busy}
          onClick={() => onPageChange(page + 1)}
        >
          {copy.next}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
