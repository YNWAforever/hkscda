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
/** The values a directory filter can take, in the order the selects list them. */
export const directoryTierValues = ["newcomer", "regular", "senior"] as const;
export const directoryStatusValues = ["pending", "active", "suspended"] as const;
