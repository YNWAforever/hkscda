import { parseListPage, type ListRouteState } from "../../../lib/admin/useListQueryState";
import type { PledgeStatus } from "../../../lib/sponsorshipAdmin/types";

export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export type PledgeFilters = {
  status: PledgeStatus | "all";
  proof: "all" | "pending";
  pageSize: (typeof PAGE_SIZE_OPTIONS)[number];
};
export const PLEDGE_STATUSES: Array<PledgeStatus | "all"> = [
  "all",
  "pending_payment",
  "provisional",
  "active",
  "needs_followup",
  "cancelled",
];
export const PLEDGE_ROUTE: ListRouteState<PledgeFilters> = {
  key: "sponsorship-pledges",
  read(params) {
    const status = params.get("status");
    const size = Number(params.get("pageSize"));
    return {
      filters: {
        status: PLEDGE_STATUSES.includes(status as PledgeStatus) ? (status as PledgeStatus) : "all",
        proof: params.get("proof") === "pending" ? "pending" : "all",
        pageSize: PAGE_SIZE_OPTIONS.includes(size as PledgeFilters["pageSize"])
          ? (size as PledgeFilters["pageSize"])
          : 25,
      },
      page: parseListPage(params.get("page")),
    };
  },
  write(params, filters, page) {
    if (filters.status === "all") params.delete("status");
    else params.set("status", filters.status);
    if (filters.proof === "all") params.delete("proof");
    else params.set("proof", filters.proof);
    if (filters.pageSize === 25) params.delete("pageSize");
    else params.set("pageSize", String(filters.pageSize));
    if (page === 1) params.delete("page");
    else params.set("page", String(page));
  },
};
