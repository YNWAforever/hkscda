import { describe, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { getFirstAllowedAdminRoute, type AdminIdentity } from "./access";
import { ADMIN_IDENTITY_QUERY_KEY } from "./identity";
import { AdminHttpError, type AdminMeResponse } from "./session";
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
  const signOut = mock(async () => {});
  return { queryClient, push, seenAtFetch, signOut };
}

describe("completeSignIn", () => {
  test("removes the cached identity before fetching and pushes a validated redirect", async () => {
    const { queryClient, push, seenAtFetch, signOut } = signInSetup(
      meResponse(staff),
      meResponse(staff),
    );
    await completeSignIn({ queryClient, redirectParam: "/admin/animals?page=2", push, signOut });
    expect(seenAtFetch.identityCached).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/admin/animals?page=2");
    // Same person signing in again: their other cached data is kept.
    expect(queryClient.getQueryData<string[]>(["animals"])).toEqual(["old"]);
  });

  test("falls back to the role's first page for an unsafe redirect", async () => {
    const { queryClient, push, signOut } = signInSetup(meResponse(staff));
    await completeSignIn({ queryClient, redirectParam: "//evil.example/admin", push, signOut });
    expect(push).toHaveBeenCalledWith(getFirstAllowedAdminRoute("staff"));
  });

  test("falls back to /admin when the identity fetch fails", async () => {
    const { queryClient, push, signOut } = signInSetup(new Error("offline"));
    await completeSignIn({ queryClient, redirectParam: undefined, push, signOut });
    expect(push).toHaveBeenCalledWith("/admin");
  });

  test("clears the whole cache when a previous identity exists and the new one cannot be confirmed", async () => {
    const { queryClient, push, signOut } = signInSetup(new Error("offline"), meResponse(admin));
    await completeSignIn({ queryClient, redirectParam: undefined, push, signOut });
    expect(queryClient.getQueryData(["animals"])).toBeUndefined();
    expect(queryClient.getQueryData(ADMIN_IDENTITY_QUERY_KEY)).toBeUndefined();
    expect(push).toHaveBeenCalledWith("/admin");
  });

  test("clears the whole cache when a different person signs in", async () => {
    const { queryClient, push, signOut } = signInSetup(meResponse(staff), meResponse(admin));
    await completeSignIn({ queryClient, redirectParam: undefined, push, signOut });
    expect(queryClient.getQueryData(["animals"])).toBeUndefined();
    expect(
      queryClient.getQueryData<AdminMeResponse>(ADMIN_IDENTITY_QUERY_KEY)?.admin.authUserId,
    ).toBe("u2");
    expect(push).toHaveBeenCalledWith(getFirstAllowedAdminRoute("staff"));
  });

  test("BUG-57: /me 403 after sign-in signs out locally and returns an error instead of navigating", async () => {
    const { queryClient, push, signOut } = signInSetup(
      new AdminHttpError("API request failed", 403),
      meResponse(admin),
    );
    const result = await completeSignIn({ queryClient, redirectParam: "/admin", push, signOut });
    expect(result).toBe("no_admin_access");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    // Nothing from the previous person stays cached.
    expect(queryClient.getQueryData(["animals"])).toBeUndefined();
    expect(queryClient.getQueryData(ADMIN_IDENTITY_QUERY_KEY)).toBeUndefined();
  });

  test("BUG-57: the error still reaches the form when the local sign-out fails", async () => {
    const { queryClient, push } = signInSetup(new AdminHttpError("API request failed", 403));
    const signOut = mock(() => Promise.reject(new Error("storage")));
    const result = await completeSignIn({ queryClient, redirectParam: undefined, push, signOut });
    expect(result).toBe("no_admin_access");
    expect(push).not.toHaveBeenCalled();
  });

  test("BUG-57: a non-403 failure still navigates and does not sign out", async () => {
    const { queryClient, push, signOut } = signInSetup(new AdminHttpError("unavailable", 503));
    const result = await completeSignIn({ queryClient, redirectParam: undefined, push, signOut });
    expect(result).toBeUndefined();
    expect(signOut).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/admin");
  });
});

describe("signOutAndLeave", () => {
  test("logout outside volunteer routes clears private session searches and bulk state", async () => {
    const values = new Map([
      ["hkscda.admin.list.query.volunteer-directory", "A-private"],
      ["volunteer-review-bulk-operation", "A-operation"],
      ["hkscda-admin-language", "en"],
    ]);
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage: {
          get length() {
            return values.size;
          },
          key: (i: number) => [...values.keys()][i] ?? null,
          removeItem: (key: string) => values.delete(key),
        },
        dispatchEvent: () => true,
      },
    });
    try {
      await signOutAndLeave(logoutSetup(async () => {}));
      expect(values.has("hkscda.admin.list.query.volunteer-directory")).toBe(false);
      expect(values.has("volunteer-review-bulk-operation")).toBe(false);
      expect(values.get("hkscda-admin-language")).toBe("en");
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
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
