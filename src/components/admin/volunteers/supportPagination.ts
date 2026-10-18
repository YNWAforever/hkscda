export const SUPPORT_PAGE_SIZE = 25;

export type SupportPage<T> = {
  items: readonly T[];
  page: number;
  pageCount: number;
  total: number;
};

/**
 * Keeps long support lists bounded without discarding data. The server already
 * caps each hydration query, so pagination here controls rendering rather than
 * access to records.
 */
export function paginateSupport<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize = SUPPORT_PAGE_SIZE,
): SupportPage<T> {
  const size = Math.max(1, Math.trunc(pageSize));
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(Math.trunc(requestedPage) || 1, 1), pageCount);
  const start = (page - 1) * size;
  return {
    items: items.slice(start, start + size),
    page,
    pageCount,
    total,
  };
}
