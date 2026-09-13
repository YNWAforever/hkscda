export type DirectorySearch = {
  q?: string;
  status?: "pending" | "active" | "suspended";
  tier?: "newcomer" | "regular" | "senior";
  page: number;
};
export function parseDirectorySearch(value: Record<string, unknown>): DirectorySearch {
  const page = Number(value.page);
  return {
    q: typeof value.q === "string" ? value.q.trim().slice(0, 200) || undefined : undefined,
    status:
      value.status === "pending" || value.status === "active" || value.status === "suspended"
        ? value.status
        : undefined,
    tier:
      value.tier === "newcomer" || value.tier === "regular" || value.tier === "senior"
        ? value.tier
        : undefined,
    page: Number.isSafeInteger(page) && page > 0 && page <= 1000000 ? page : 1,
  };
}
export function directoryQuery(search: DirectorySearch) {
  const params = new URLSearchParams({ page: String(search.page) });
  if (search.q) params.set("q", search.q);
  if (search.status) params.set("status", search.status);
  if (search.tier) params.set("tier", search.tier);
  return params.toString();
}
export const directoryTiers = { newcomer: "新手義工", regular: "恆常義工", senior: "資深義工" };
export const directoryStatuses = { pending: "待核實", active: "已啟用", suspended: "已暫停" };
