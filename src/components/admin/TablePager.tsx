import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "../ui/button";

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
  label = "資料",
}: TablePagerProps) {
  // Without a total we can't know whether a next page exists. Assume there is
  // one whenever the current page came back full — stopping early would hide
  // rows, which is the bug this component exists to fix.
  const knownTotal = typeof total === "number";
  const lastPage = knownTotal ? Math.max(1, Math.ceil(total / pageSize)) : undefined;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = knownTotal ? Math.min(page * pageSize, total) : page * pageSize;

  const hasPrevious = page > 1;
  const hasNext = knownTotal ? page < (lastPage ?? 1) : true;

  // A single page of results needs no controls.
  if (knownTotal && (lastPage ?? 1) <= 1) return null;

  return (
    <nav
      aria-label={`${label}分頁`}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3"
    >
      <p aria-live="polite" className="text-xs tabular-nums text-[var(--color-text-muted)]">
        {knownTotal ? (
          <>
            顯示第 {first}–{last} 項，共 {total} 項
          </>
        ) : (
          <>
            第 {page} 頁（第 {first}–{last} 項）
          </>
        )}
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
          上一頁
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
          下一頁
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
