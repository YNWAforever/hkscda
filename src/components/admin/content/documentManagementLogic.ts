type PageAfterDeleteInput = {
  page: number;
  total: number;
  pageSize: number;
};

export function pageAfterDelete({ page, total, pageSize }: PageAfterDeleteInput) {
  const remainingTotal = Math.max(0, total - 1);
  const remainingPages = Math.max(1, Math.ceil(remainingTotal / pageSize));
  return Math.min(page, remainingPages);
}

type PageResult<T> = {
  items: T[];
  total: number;
};

export async function fetchAllAnnualReportAssets<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PageResult<T>>,
) {
  const pageSize = 100;
  const items: T[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (items.length < total) {
    const result = await fetchPage(page, pageSize);
    items.push(...result.items);
    total = result.total;
    if (result.items.length === 0) break;
    page += 1;
  }

  return items;
}
