import { hkDate } from "../../../lib/volunteers/bulk/service";
import { readActivityRouteState, writeActivityRouteState } from "./activityRouteState";
export type ActivityReturnState = {
  from: "activities" | "calendar";
  safeSearch: Record<string, string>;
};
export function activityRouterSearch(
  state: ActivityReturnState,
): Record<string, string | number | boolean> {
  const safe = readActivityReturnState(
    new URLSearchParams({ ...state.safeSearch, return_from: state.from }),
  );
  return Object.fromEntries(
    Object.entries(safe.safeSearch).map(([key, value]) => [
      key,
      key === "page" || key === "detail_page"
        ? Number(value)
        : key === "shortage"
          ? value === "true"
          : value,
    ]),
  );
}
const safeKeys = [
  "date_scope",
  "from",
  "until",
  "shelter",
  "template",
  "status",
  "scenario",
  "readiness",
  "shortage",
  "sort",
  "page",
  "detail_page",
  "view",
  "selected",
];
export function readActivityReturnState(params: URLSearchParams): ActivityReturnState {
  const safeSearch: Record<string, string> = {};
  const candidate = new URLSearchParams();
  for (const key of safeKeys) {
    const value = params.get(key);
    if (value !== null) candidate.set(key, value);
  }
  if (candidate.size) {
    const state = readActivityRouteState(candidate, hkDate());
    const canonical = new URLSearchParams();
    writeActivityRouteState(canonical, state);
    for (const key of safeKeys) {
      const value = canonical.get(key);
      if (
        value !== null &&
        candidate.has(key) &&
        !(key === "page" && value === "1" && candidate.get(key) !== "1")
      )
        safeSearch[key] = value;
    }
    if (["table", "calendar"].includes(candidate.get("view") ?? ""))
      safeSearch.view = candidate.get("view")!;
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        candidate.get("selected") ?? "",
      )
    )
      safeSearch.selected = candidate.get("selected")!;
  }
  return { from: params.get("return_from") === "calendar" ? "calendar" : "activities", safeSearch };
}
export function buildActivityReturnHref(state: ActivityReturnState): string {
  const safe = readActivityReturnState(
    new URLSearchParams({ ...state.safeSearch, return_from: state.from }),
  );
  const search = new URLSearchParams(safe.safeSearch).toString();
  return `/admin/volunteers/${safe.from}${search ? "?" + search : ""}`;
}

// Activity pagination belongs to the return journey, never the task list itself.
const pendingReturnPrefix = "activity_return_";
export function buildLegacyPendingHref(params: URLSearchParams): string {
  const state = readActivityReturnState(params);
  const search = new URLSearchParams({ pending_scope: "all" });
  search.set(pendingReturnPrefix + "return_from", state.from);
  for (const [key, value] of Object.entries(state.safeSearch))
    search.set(pendingReturnPrefix + key, value);
  return "/admin/volunteers/tasks?" + search;
}
export function readPendingActivityReturnState(params: URLSearchParams): ActivityReturnState {
  const candidate = new URLSearchParams();
  for (const key of [...safeKeys, "return_from"]) {
    const value = params.get(pendingReturnPrefix + key);
    if (value !== null) candidate.set(key, value);
  }
  return readActivityReturnState(candidate);
}
export function buildPendingRegistrationHref(id: string, state?: ActivityReturnState): string {
  const safe = readActivityReturnState(
    new URLSearchParams({ ...state?.safeSearch, return_from: state?.from ?? "activities" }),
  );
  const search = new URLSearchParams({ ...safe.safeSearch, return_from: safe.from });
  return `/admin/volunteers/registrations/${encodeURIComponent(id)}?${search}`;
}
