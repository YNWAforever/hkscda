import { createContext, useContext, useEffect } from "react";

/**
 * How a record page tells the layout which record it shows. The layout owns the breadcrumb and
 * the page below it owns the record, so the page reports the name it has already loaded; the
 * layout never fetches it. Outside an `AdminLayout` there is nothing to tell, and it does nothing.
 */
export const BreadcrumbRecordContext = createContext<((name: string | null) => void) | null>(null);

/**
 * Call once with the record's name, before any early return. Pass `null` or `undefined` while the
 * record is loading, failed to load or was not found: the breadcrumb then ends at the destination.
 */
export function useBreadcrumbRecordName(name: string | null | undefined): void {
  const report = useContext(BreadcrumbRecordContext);
  const value = name ?? null;
  useEffect(() => {
    if (!report) return;
    report(value);
    return () => report(null);
  }, [report, value]);
}
