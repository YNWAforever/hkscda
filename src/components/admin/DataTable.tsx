import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useSharedAdminCopy } from "./i18n/copy";
import { LoadFailure } from "./LoadFailure";
import { sharedUiCopy } from "./sharedUiCopy";

export type DataTableColumn<T> = {
  /** Stable identifier for the column (used as the React key). */
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Extra classes applied to both the header cell and body cells. */
  className?: string;
  align?: "left" | "right" | "center";
};

type DataTableBaseProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** When true, render `skeletonRows` shimmer rows instead of data. */
  loading?: boolean;
  skeletonRows?: number;
  /** Shown when there are no rows and not loading. */
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /**
   * Optional per-row mobile renderer. When provided, the table is hidden below
   * `md` and these cards are shown instead — the responsive seam Phase 4 builds
   * on. When omitted, the table simply scrolls horizontally on small screens.
   */
  renderMobileCard?: (row: T) => ReactNode;
  className?: string;
  /**
   * Replaces the default heading of the failure state when a screen already worded its own
   * ("Could not load the supporters."). The guidance and the retry control stay the same.
   */
  failureTitle?: ReactNode;
  /** Names a keyboard-focusable table inside its horizontal scroll container. */
  accessibleLabel?: string;
};

/**
 * The load failure and the way to retry it come together. `error` is the query's error,
 * passed straight through: it takes precedence over `empty`, because a failed fetch leaves
 * `rows` empty, and rendering that as "No results" tells the operator there is no work
 * waiting when in fact nothing was read. A table that passes `error` must also pass
 * `onRetry`, which re-runs the failed query; a table with no query passes neither.
 */
type DataTableFailureProps =
  | { error?: undefined; onRetry?: undefined }
  | { error: unknown; onRetry: () => void };

type DataTableProps<T> = DataTableBaseProps<T> & DataTableFailureProps;

/** Stands in for a retry that the types make unreachable: a failure always comes with one. */
const NO_RETRY = () => {};

const ALIGN_CLASS = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

const CELL_PADDING = "px-3 py-2.5";

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  loading = false,
  skeletonRows = 5,
  empty: emptyProp,
  error,
  onRetry,
  failureTitle,
  onRowClick,
  renderMobileCard,
  className,
  accessibleLabel,
}: DataTableProps<T>) {
  const copy = useSharedAdminCopy(sharedUiCopy).dataTable;
  const empty = emptyProp === undefined ? copy.empty : emptyProp;
  // Precedence is loading -> error -> empty -> rows. `failed` must be consulted
  // before the rows.length === 0 branch, otherwise an outage is rendered as
  // the empty state -- the defect this prop exists to close.
  const failed = !loading && error != null;
  const failureCell = (
    <LoadFailure
      error={error}
      onRetry={onRetry ?? NO_RETRY}
      title={failureTitle}
      className="border-0"
    />
  );
  const table = (
    <Table
      className={className}
      aria-label={accessibleLabel}
      tabIndex={accessibleLabel ? 0 : undefined}
    >
      <TableHeader>
        <TableRow className="border-[var(--color-border)] hover:bg-transparent">
          {columns.map((column) => (
            <TableHead
              key={column.id}
              className={cn(
                CELL_PADDING,
                "text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]",
                column.align && ALIGN_CLASS[column.align],
                column.className,
              )}
            >
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          Array.from({ length: skeletonRows }).map((_, rowIndex) => (
            <TableRow key={`skeleton-${rowIndex}`} className="border-[var(--color-border)]">
              {columns.map((column) => (
                <TableCell key={column.id} className={CELL_PADDING}>
                  <div className="h-4 w-full max-w-[8rem] animate-pulse rounded bg-[var(--color-surface-2)]" />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : failed ? (
          <TableRow className="border-[var(--color-border)] hover:bg-transparent">
            <TableCell colSpan={columns.length} className="px-3 py-4">
              {failureCell}
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow className="border-[var(--color-border)] hover:bg-transparent">
            <TableCell
              colSpan={columns.length}
              className="px-3 py-10 text-center text-sm text-[var(--color-text-muted)]"
            >
              {empty}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-[var(--color-border)] hover:bg-[var(--color-surface-2)]",
                onRowClick && "cursor-pointer",
              )}
            >
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  className={cn(
                    CELL_PADDING,
                    column.align && ALIGN_CLASS[column.align],
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  if (!renderMobileCard) {
    return table;
  }

  return (
    <>
      <div className="hidden md:block">{table}</div>
      <div className="space-y-3 md:hidden">
        {loading ? (
          Array.from({ length: skeletonRows }).map((_, index) => (
            <div
              key={`m-skeleton-${index}`}
              className="h-24 animate-pulse rounded-xl bg-[var(--color-surface-2)]"
            />
          ))
        ) : failed ? (
          failureCell
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] px-3 py-10 text-center text-sm text-[var(--color-text-muted)]">
            {empty}
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3",
                onRowClick && "cursor-pointer",
              )}
            >
              {renderMobileCard(row)}
            </div>
          ))
        )}
      </div>
    </>
  );
}
