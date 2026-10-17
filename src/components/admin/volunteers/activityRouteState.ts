import {
  activityFilterSchema,
  addHkDays,
  type ActivityFilter,
} from "../../../lib/volunteers/bulk/service";
import { parseListPage } from "../../../lib/admin/useListQueryState";

export type ActivityDateScope = "future" | "history" | "all" | "custom";
export type ActivityUiFilters = ActivityFilter & { date_scope: ActivityDateScope };
const keys = [
  "from",
  "until",
  "shelter",
  "template",
  "status",
  "scenario",
  "readiness",
  "shortage",
  "sort",
] as const;
export function readActivityRouteState(
  params: URLSearchParams,
  today: string,
): { filters: ActivityUiFilters; page: number; detailPage: number } {
  const raw = params.get("date_scope");
  const scope = raw ?? (params.has("from") || params.has("until") ? "custom" : "future");
  const defaults: ActivityUiFilters = {
    date_scope: "future",
    from: today,
    until: addHkDays(today, 30),
    sort: "asc",
  };
  if (!["future", "history", "all", "custom"].includes(scope))
    return {
      filters: defaults,
      page: parseListPage(params.get("page")),
      detailPage: parseListPage(params.get("detail_page")),
    };
  const parsed = activityFilterSchema.safeParse({
    from:
      scope === "all" || scope === "history"
        ? undefined
        : (params.get("from") ?? (scope === "future" ? today : undefined)),
    until:
      scope === "all"
        ? undefined
        : scope === "history"
          ? addHkDays(today, -1)
          : (params.get("until") ?? (scope === "future" ? addHkDays(today, 30) : undefined)),
    shelter: params.get("shelter") ?? "",
    template: params.get("template") ?? "",
    status: params.get("status") ?? "",
    scenario: params.get("scenario") ?? "",
    readiness: params.get("readiness") ?? "",
    shortage: params.get("shortage") === "true",
    sort: params.get("sort") ?? (scope === "history" ? "desc" : "asc"),
  });
  return {
    filters: parsed.success ? { ...parsed.data, date_scope: scope as ActivityDateScope } : defaults,
    page: parseListPage(params.get("page")),
    detailPage: parseListPage(params.get("detail_page")),
  };
}
export function writeActivityRouteState(
  params: URLSearchParams,
  state: { filters: ActivityUiFilters; page: number; detailPage?: number },
): void {
  params.delete("q");
  for (const key of keys) {
    params.delete(key);
    const value = state.filters[key];
    if (value !== undefined && value !== "" && value !== false) params.set(key, String(value));
  }
  params.set("date_scope", state.filters.date_scope);
  params.set("page", String(state.page));
  params.delete("detail_page");
  if (state.detailPage && state.detailPage > 1 && state.detailPage <= 100000)
    params.set("detail_page", String(state.detailPage));
}
export function toActivityApiFilter(ui: ActivityUiFilters): ActivityFilter {
  const { date_scope: _scope, ...filter } = ui;
  return filter;
}
