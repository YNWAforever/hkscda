import { describe, expect, mock, test } from "bun:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";

import { AdminHttpError, AdminSessionError } from "../../lib/admin/session";
import { expiryNavigate, watchSessionExpiry } from "./useSessionExpiryRedirect";

function setup(path = "/admin/cases/abc?tab=notes") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const navigate = mock((_url: string) => {});
  let authListener: ((event: string) => void) | null = null;
  const unsubscribeAuth = mock(() => {
    authListener = null;
  });
  const watcher = watchSessionExpiry({
    queryClient,
    navigate,
    getPath: () => path,
    onAuthStateChange: (listener) => {
      authListener = listener;
      return unsubscribeAuth;
    },
  });
  return {
    queryClient,
    navigate,
    watcher,
    unsubscribeAuth,
    emitAuth: (event: string) => authListener?.(event),
  };
}

async function failQuery(queryClient: QueryClient, key: string, error: Error) {
  await queryClient
    .fetchQuery({
      queryKey: [key],
      queryFn: () => Promise.reject(error),
      retry: false,
    })
    .catch(() => {});
}

describe("watchSessionExpiry", () => {
  test("navigates exactly once when three queries fail with a session error together", async () => {
    const { queryClient, navigate } = setup();
    await Promise.all([
      failQuery(queryClient, "a", new AdminSessionError("not_signed_in")),
      failQuery(queryClient, "b", new AdminSessionError("identity_changed")),
      failQuery(queryClient, "c", new AdminHttpError("API request failed", 401)),
    ]);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(
      "/admin/login?redirect=%2Fadmin%2Fcases%2Fabc%3Ftab%3Dnotes",
    );
  });

  test("clears the cached data before it navigates, so the next person sees none of it", async () => {
    const { queryClient, navigate } = setup();
    queryClient.setQueryData(["supporters"], ["private"]);
    let cachedAtNavigation: unknown = "unset";
    navigate.mockImplementation(() => {
      cachedAtNavigation = queryClient.getQueryData(["supporters"]);
    });
    await failQuery(queryClient, "a", new AdminSessionError("not_signed_in"));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(cachedAtNavigation).toBeUndefined();
  });

  test("ignores failures that are not a lapsed session", async () => {
    const { queryClient, navigate } = setup();
    await failQuery(queryClient, "a", new AdminHttpError("nope", 403));
    await failQuery(queryClient, "b", new AdminHttpError("boom", 500));
    await failQuery(queryClient, "c", new Error("offline"));
    expect(navigate).not.toHaveBeenCalled();
  });

  test("navigates when a mutation fails with a session error", async () => {
    const { queryClient, navigate } = setup();
    const observer = new MutationObserver(queryClient, {
      mutationFn: () => Promise.reject(new AdminSessionError("not_signed_in")),
    });
    await observer.mutate().catch(() => {});
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  test("navigates once on SIGNED_OUT and ignores other auth events", () => {
    const { navigate, emitAuth } = setup();
    emitAuth("SIGNED_IN");
    emitAuth("TOKEN_REFRESHED");
    expect(navigate).not.toHaveBeenCalled();
    emitAuth("SIGNED_OUT");
    emitAuth("SIGNED_OUT");
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  test("a query failure and SIGNED_OUT together still navigate once", async () => {
    const { queryClient, navigate, emitAuth } = setup();
    emitAuth("SIGNED_OUT");
    await failQuery(queryClient, "a", new AdminSessionError("not_signed_in"));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  test.each([
    "/admin/login",
    "/admin/login?redirect=%2Fadmin",
    "/admin/reset-password",
    // The router matches routes case-insensitively and decodes the path, so each of these
    // renders a sign-in page too.
    "/admin/%6Cogin",
    "/admin/%6cogin/",
    "/admin/Login",
    "/admin/LOGIN?x=1",
    "/admin/login/",
    "/admin/reset-%70assword",
    "/admin/Reset-Password/",
  ])("does nothing while on %s", async (path) => {
    const { queryClient, navigate, emitAuth } = setup(path);
    await failQuery(queryClient, "a", new AdminSessionError("not_signed_in"));
    emitAuth("SIGNED_OUT");
    expect(navigate).not.toHaveBeenCalled();
  });

  test("suppress() stops a deliberate sign-out from carrying a redirect", () => {
    const { navigate, emitAuth, watcher } = setup();
    watcher.suppress();
    emitAuth("SIGNED_OUT");
    expect(navigate).not.toHaveBeenCalled();
  });

  test("clears the cache, then navigates past any unsaved-changes blocker", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["animal"], { name: "private" });
    const calls: { options: unknown; cached: unknown }[] = [];
    const router = {
      navigate: (options: { href: string; ignoreBlocker: boolean }) => {
        calls.push({ options, cached: queryClient.getQueryData(["animal"]) });
        return Promise.resolve();
      },
    };
    watchSessionExpiry({
      queryClient,
      navigate: expiryNavigate(router),
      getPath: () => "/admin/animals/a1/edit",
      onAuthStateChange: () => () => {},
    });
    await failQuery(queryClient, "a", new AdminSessionError("not_signed_in"));
    expect(calls).toEqual([
      {
        options: {
          href: "/admin/login?redirect=%2Fadmin%2Fanimals%2Fa1%2Fedit",
          ignoreBlocker: true,
        },
        cached: undefined,
      },
    ]);
  });

  test("stop() unsubscribes from both caches and the auth listener", async () => {
    const { queryClient, navigate, watcher, unsubscribeAuth } = setup();
    watcher.stop();
    expect(unsubscribeAuth).toHaveBeenCalledTimes(1);
    await failQuery(queryClient, "a", new AdminSessionError("not_signed_in"));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("expiryNavigate", () => {
  test("asks the router to ignore blockers, so a dirty form's leave dialog cannot stop it", () => {
    const recorded: unknown[] = [];
    const navigate = expiryNavigate({
      navigate: (options) => {
        recorded.push(options);
        return Promise.resolve();
      },
    });
    navigate("/admin/login?redirect=%2Fadmin");
    expect(recorded).toEqual([{ href: "/admin/login?redirect=%2Fadmin", ignoreBlocker: true }]);
  });

  test("falls back to a full page load when there is no router", () => {
    const assigned: string[] = [];
    expiryNavigate(undefined, (url) => assigned.push(url))("/admin/login");
    expect(assigned).toEqual(["/admin/login"]);
  });
});
