import { parseListPage } from "../../../lib/admin/useListQueryState";
import {
  activityRouterSearch,
  buildActivityReturnHref,
  buildLegacyPendingHref,
  readActivityReturnState,
  readPendingActivityReturnState,
  type ActivityReturnState,
} from "./activityReturnState";
export type RegistrationReturnState =
  | ActivityReturnState
  | {
      from: "tasks";
      safeSearch: Record<string, string>;
    };
export function readRegistrationReturnState(params: URLSearchParams): RegistrationReturnState {
  if (params.get("return_from") !== "tasks") return readActivityReturnState(params);
  const scope = params.get("pending_scope");
  const safeSearch: Record<string, string> = {
    pending_scope: scope === "upcoming" || scope === "overdue" ? scope : "all",
    page: String(parseListPage(params.get("page"))),
  };
  if (params.has("activity_return_return_from")) {
    const activity = readPendingActivityReturnState(params);
    const legacy = buildLegacyPendingHref(
      new URLSearchParams({ ...activity.safeSearch, return_from: activity.from }),
    );
    for (const [key, value] of new URL(legacy, "http://return.invalid").searchParams)
      if (key.startsWith("activity_return_")) safeSearch[key] = value;
  }
  return { from: "tasks", safeSearch };
}
export function registrationRouterSearch(
  state: RegistrationReturnState,
): Record<string, string | number | boolean> {
  if (state.from !== "tasks") return activityRouterSearch(state);
  const safe = readRegistrationReturnState(
    new URLSearchParams({ ...state.safeSearch, return_from: "tasks" }),
  );
  return Object.fromEntries(
    Object.entries(safe.safeSearch).map(([key, value]) => [
      key,
      key === "page" ? Number(value) : value,
    ]),
  );
}
export function buildRegistrationReturnHref(state: RegistrationReturnState): string {
  if (state.from !== "tasks") return buildActivityReturnHref(state);
  const safe = readRegistrationReturnState(
    new URLSearchParams({ ...state.safeSearch, return_from: "tasks" }),
  );
  return "/admin/volunteers/tasks?" + new URLSearchParams(safe.safeSearch);
}
export function buildTaskRegistrationHref(id: string, state: RegistrationReturnState): string {
  const safe = readRegistrationReturnState(
    new URLSearchParams({ ...state.safeSearch, return_from: state.from }),
  );
  return (
    `/admin/volunteers/registrations/${encodeURIComponent(id)}?` +
    new URLSearchParams({ ...safe.safeSearch, return_from: safe.from })
  );
}
