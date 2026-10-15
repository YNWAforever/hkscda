import { queryOptions } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { volunteerQueryKeys } from "../../../lib/volunteers/queryKeys";
import type { Template } from "./activityWorkspaceTypes";

export function workspaceTemplatesQueryOptions(fetcher = fetchAdminJson) {
  return queryOptions({
    queryKey: volunteerQueryKeys.key("workspaceTemplates"),
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      fetcher<{ templates: Template[] }>("/api/admin/volunteers/bulk", {
        method: "POST",
        body: JSON.stringify({ action: "templates" }),
        signal,
      }),
  });
}
