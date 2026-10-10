import type { QueryClient } from "@tanstack/react-query";

import { ADMIN_IDENTITY_QUERY_KEY, adminIdentityQueryOptions } from "./identity";
import { postSignInDestination } from "./loginRedirect";
import type { AdminMeResponse } from "./session";

/**
 * Finishes a sign-in: reads the new account's identity (never the previous account's cached
 * one), drops every cached query if the account changed, and goes to the destination.
 */
export async function completeSignIn({
  queryClient,
  redirectParam,
  push,
}: {
  queryClient: QueryClient;
  redirectParam: unknown;
  push: (path: string) => void;
}): Promise<void> {
  const previousId =
    queryClient.getQueryData<AdminMeResponse>(ADMIN_IDENTITY_QUERY_KEY)?.admin.authUserId;
  queryClient.removeQueries({ queryKey: ADMIN_IDENTITY_QUERY_KEY });
  const result = await queryClient.fetchQuery(adminIdentityQueryOptions()).catch(() => null);
  if (previousId && (!result || previousId !== result.admin.authUserId)) {
    // Another person signed in on this tab, or we cannot tell who: nothing the last one saw
    // may stay cached.
    queryClient.clear();
    if (result) queryClient.setQueryData(ADMIN_IDENTITY_QUERY_KEY, result);
  }
  push(postSignInDestination(redirectParam, result?.admin ?? null));
}

/**
 * A deliberate sign-out. The expiry watcher is silenced first so the sign-out carries no
 * `redirect`, and the cache is cleared and the user sent to sign-in even if `signOut` throws.
 */
export async function signOutAndLeave({
  suppressSessionExpiry,
  signOut,
  queryClient,
  push,
}: {
  suppressSessionExpiry: () => void;
  signOut: () => Promise<unknown>;
  queryClient: QueryClient;
  push: () => void;
}): Promise<void> {
  suppressSessionExpiry();
  try {
    await signOut();
  } finally {
    // Otherwise the next admin to sign in on this tab reads the previous one's cached identity.
    queryClient.clear();
    push();
  }
}
