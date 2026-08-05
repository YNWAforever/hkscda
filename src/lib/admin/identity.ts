import { queryOptions } from "@tanstack/react-query";

import { fetchAdminIdentity } from "./session";

export const ADMIN_IDENTITY_QUERY_KEY = ["admin-me"] as const;

/**
 * Long enough that a page load and the navigations after it share one response;
 * short enough that a role changed elsewhere shows up promptly. Role changes
 * made in this app invalidate the key directly, so this is only the backstop.
 */
export const ADMIN_IDENTITY_STALE_TIME_MS = 60_000;

/**
 * The one definition of "who is the signed-in admin".
 *
 * Six call sites used to answer this independently, under two different query
 * keys and with no staleTime, so the identity was refetched on every mount and
 * a role change never reached one of them. Everything goes through here now.
 */
export function adminIdentityQueryOptions() {
  return queryOptions({
    queryKey: ADMIN_IDENTITY_QUERY_KEY,
    queryFn: fetchAdminIdentity,
    staleTime: ADMIN_IDENTITY_STALE_TIME_MS,
  });
}
