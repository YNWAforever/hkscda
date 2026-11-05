import { queryOptions } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { volunteerQueryKeys } from "../../../lib/volunteers/queryKeys";
import type { DirectoryDetail } from "../../../lib/volunteers/directory/types";

export type CredentialDefinitions = { credential_definitions: { key: string; label: string }[] };

/**
 * The qualification definitions for the "verify a course or skill" form. `list` returns only
 * these: it no longer returns every profile and credential (BUG-65).
 */
export function qualificationDefinitionsQueryOptions(fetcher = fetchAdminJson) {
  return queryOptions({
    queryKey: volunteerQueryKeys.key("qualifications", "definitions"),
    queryFn: ({ signal }) =>
      fetcher<CredentialDefinitions>("/api/admin/volunteers/qualifications", {
        method: "POST",
        body: JSON.stringify({ action: "list" }),
        signal,
      }),
  });
}

/**
 * One profile with its credentials (capped), from the volunteer directory, read only once a
 * profile is chosen. The qualifications prefix keeps it refreshed after a qualification change.
 */
export function qualificationProfileQueryOptions(profileId: string, fetcher = fetchAdminJson) {
  return queryOptions({
    queryKey: volunteerQueryKeys.key("qualifications", "profile", profileId),
    queryFn: ({ signal }) =>
      fetcher<DirectoryDetail>("/api/admin/volunteers/people", {
        method: "POST",
        body: JSON.stringify({ profile_id: profileId }),
        signal,
      }),
    enabled: Boolean(profileId),
  });
}
