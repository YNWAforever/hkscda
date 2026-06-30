import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

export type DataTableColumn<T> = {
  /** Stable identifier for the column (used as the React key). */
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Extra classes applied to both the header cell and body cells. */
  className?: string;
  align?: "left" | "right" | "center";
};

type DataTableProps<T> = {
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
};

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
  empty = "沒有結果",
  onRowClick,
  renderMobileCard,
  className,
}: DataTableProps<T>) {
  const table = (
    <Table className={className}>
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
