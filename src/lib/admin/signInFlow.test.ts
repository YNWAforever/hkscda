import { describe, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { getFirstAllowedAdminRoute, type AdminIdentity } from "./access";
import { ADMIN_IDENTITY_QUERY_KEY } from "./identity";
import type { AdminMeResponse } from "./session";
import { completeSignIn, signOutAndLeave } from "./signInFlow";

const admin: AdminIdentity = {
  id: "a1",
  authUserId: "u1",
  email: "a@example.com",
  role: "treasurer",
  status: "active",
};
const staff: AdminIdentity = { ...admin, id: "a2", authUserId: "u2", role: "staff" };

function meResponse(who: AdminIdentity): AdminMeResponse {
  return { admin: who };
}

function signInSetup(fetched: AdminMeResponse | Error, cached?: AdminMeResponse) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cached) queryClient.setQueryData(ADMIN_IDENTITY_QUERY_KEY, cached);
  queryClient.setQueryData(["animals"], ["old"]);
  const seenAtFetch: { identityCached: boolean | null } = { identityCached: null };
  const original = queryClient.fetchQuery.bind(queryClient);
  queryClient.fetchQuery = ((options: Parameters<typeof original>[0]) => {
    seenAtFetch.identityCached = queryClient.getQueryData(ADMIN_IDENTITY_QUERY_KEY) !== undefined;
    return original({
      ...options,
      queryFn: () =>
        fetched instanceof Error ? Promise.reject(fetched) : Promise.resolve(fetched),
    });
  }) as typeof queryClient.fetchQuery;
  const push = mock((_path: string) => {});
  return { queryClient, push, seenAtFetch };
}

describe("completeSignIn", () => {
  test("removes the cached identity before fetching and pushes a validated redirect", async () => {
    const { queryClient, push, seenAtFetch } = signInSetup(meResponse(staff), meResponse(staff));
    await completeSignIn({ queryClient, redirectParam: "/admin/animals?page=2", push });
    expect(seenAtFetch.identityCached).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/admin/animals?page=2");
    // Same person signing in again: their other cached data is kept.
    expect(queryClient.getQueryData<string[]>(["animals"])).toEqual(["old"]);
  });

  test("falls back to the role's first page for an unsafe redirect", async () => {
    const { queryClient, push } = signInSetup(meResponse(staff));
    await completeSignIn({ queryClient, redirectParam: "//evil.example/admin", push });
    expect(push).toHaveBeenCalledWith(getFirstAllowedAdminRoute("staff"));
  });

  test("falls back to /admin when the identity fetch fails", async () => {
    const { queryClient, push } = signInSetup(new Error("offline"));
    await completeSignIn({ queryClient, redirectParam: undefined, push });
    expect(push).toHaveBeenCalledWith("/admin");
  });

  test("clears the whole cache when a previous identity exists and the new one cannot be confirmed", async () => {
    const { queryClient, push } = signInSetup(new Error("offline"), meResponse(admin));
    await completeSignIn({ queryClient, redirectParam: undefined, push });
    expect(queryClient.getQueryData(["animals"])).toBeUndefined();
    expect(queryClient.getQueryData(ADMIN_IDENTITY_QUERY_KEY)).toBeUndefined();
    expect(push).toHaveBeenCalledWith("/admin");
  });

  test("clears the whole cache when a different person signs in", async () => {
    const { queryClient, push } = signInSetup(meResponse(staff), meResponse(admin));
    await completeSignIn({ queryClient, redirectParam: undefined, push });
    expect(queryClient.getQueryData(["animals"])).toBeUndefined();
    expect(
      queryClient.getQueryData<AdminMeResponse>(ADMIN_IDENTITY_QUERY_KEY)?.admin.authUserId,
    ).toBe("u2");
    expect(push).toHaveBeenCalledWith(getFirstAllowedAdminRoute("staff"));
  });
});

describe("signOutAndLeave", () => {
  function logoutSetup(signOut: () => Promise<unknown>) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["animals"], ["old"]);
    const order: string[] = [];
    const suppressSessionExpiry = mock(() => order.push("suppress"));
    const push = mock(() => order.push("push"));
    return { queryClient, order, suppressSessionExpiry, push, signOut };
  }

  test("silences the watcher, signs out, clears the cache and leaves", async () => {
    const deps = logoutSetup(async () => {});
    await signOutAndLeave(deps);
    expect(deps.order).toEqual(["suppress", "push"]);
    expect(deps.queryClient.getQueryData(["animals"])).toBeUndefined();
  });

  test("still clears and leaves when signOut throws", async () => {
    const deps = logoutSetup(() => Promise.reject(new Error("network")));
    await expect(signOutAndLeave(deps)).rejects.toThrow("network");
    expect(deps.push).toHaveBeenCalledTimes(1);
    expect(deps.queryClient.getQueryData(["animals"])).toBeUndefined();
  });
});
