import { hkDate } from "../../../lib/volunteers/bulk/service";
import { readActivityRouteState, writeActivityRouteState } from "./activityRouteState";
export type ActivityReturnState = {
  from: "activities" | "calendar";
  safeSearch: Record<string, string>;
};
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
