import { queryOptions } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { volunteerQueryKeys } from "../../../lib/volunteers/queryKeys";
import type { AssessmentListing, AssessmentJob } from "./VolunteerAssessments";
export function assessmentListingQueryOptions(fetcher = fetchAdminJson) {
  return queryOptions({
    queryKey: volunteerQueryKeys.key("assessments"),
    queryFn: ({ signal }) =>
      fetcher<AssessmentListing>("/api/admin/volunteers/assessments/", {
        method: "POST",
        body: JSON.stringify({ kind: "list" }),
        signal,
      }),
  });
}
export function assessmentJobsQueryOptions(fetcher = fetchAdminJson) {
  return queryOptions({
    queryKey: volunteerQueryKeys.key("assessmentJobs"),
    queryFn: ({ signal }) =>
      fetcher<{ jobs: AssessmentJob[] }>("/api/admin/volunteers/jobs/", { signal }),
  });
}
export function shouldHydrateAssessmentDraft(
  dirty: boolean,
  loadedRevision: number,
  incomingRevision: number,
): boolean {
  return !dirty && incomingRevision > loadedRevision;
}
