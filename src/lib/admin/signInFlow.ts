import type { QueryClient } from "@tanstack/react-query";

import { ADMIN_IDENTITY_QUERY_KEY, adminIdentityQueryOptions } from "./identity";
import { postSignInDestination } from "./loginRedirect";
import type { AdminMeResponse } from "./session";
import { clearVolunteerSessionSearch } from "../volunteers/queryKeys";

function clearPrivateSessionSearch() {
  if (typeof window === "undefined") return;
  try {
    clearVolunteerSessionSearch(window.sessionStorage);
  } catch {
    /* Optional storage. */
  }
  try {
    window.dispatchEvent(new Event("hkscda-admin-identity-cleared"));
  } catch {
    /* Auth must remain usable. */
  }
}

/** Why a sign-in whose password was accepted did not continue to the admin. */
export type SignInRefusal = "no_admin_access";

/**
 * Finishes a sign-in: reads the new account's identity (never the previous account's cached
 * one), drops every cached query if the account changed, and goes to the destination.
 *
 * `/api/admin/me` answers 403 for an account with no admin row or a disabled one. Navigating
 * then lands on a load failure whose retry always fails and offers no sign-out (BUG-57), so
 * the session is signed out locally and the refusal is returned for the form to show.
 */
export async function completeSignIn({
  queryClient,
  redirectParam,
  push,
  signOut,
}: {
  queryClient: QueryClient;
  redirectParam: unknown;
  push: (path: string) => void;
  signOut: () => Promise<unknown>;
}): Promise<SignInRefusal | undefined> {
  const previousId =
    queryClient.getQueryData<AdminMeResponse>(ADMIN_IDENTITY_QUERY_KEY)?.admin.authUserId;
  queryClient.removeQueries({ queryKey: ADMIN_IDENTITY_QUERY_KEY });
  let forbidden = false;
  const result = await queryClient
    .fetchQuery(adminIdentityQueryOptions())
    .catch((error: unknown) => {
      forbidden = error instanceof Error && (error as { status?: unknown }).status === 403;
      return null;
    });
  if (forbidden) {
    queryClient.clear();
    clearPrivateSessionSearch();
    await signOut().catch(() => undefined);
    return "no_admin_access";
  }
  if (!result || previousId !== result.admin.authUserId) {
    // Another person signed in on this tab, or we cannot tell who: nothing the last one saw
    // may stay cached.
    queryClient.clear();
    clearPrivateSessionSearch();
    if (result) queryClient.setQueryData(ADMIN_IDENTITY_QUERY_KEY, result);
  }
  push(postSignInDestination(redirectParam, result?.admin ?? null));
  return undefined;
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
    clearPrivateSessionSearch();
    push();
  }
}
