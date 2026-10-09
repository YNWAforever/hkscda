import { describe, expect, mock, test } from "bun:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";

import { AdminHttpError, AdminSessionError } from "../../lib/admin/session";
import { watchSessionExpiry } from "./useSessionExpiryRedirect";

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

  test.each(["/admin/login", "/admin/login?redirect=%2Fadmin", "/admin/reset-password"])(
    "does nothing while on %s",
    async (path) => {
      const { queryClient, navigate, emitAuth } = setup(path);
      await failQuery(queryClient, "a", new AdminSessionError("not_signed_in"));
      emitAuth("SIGNED_OUT");
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  test("suppress() stops a deliberate sign-out from carrying a redirect", () => {
    const { navigate, emitAuth, watcher } = setup();
    watcher.suppress();
    emitAuth("SIGNED_OUT");
    expect(navigate).not.toHaveBeenCalled();
  });

  test("stop() unsubscribes from both caches and the auth listener", async () => {
    const { queryClient, navigate, watcher, unsubscribeAuth } = setup();
    watcher.stop();
    expect(unsubscribeAuth).toHaveBeenCalledTimes(1);
    await failQuery(queryClient, "a", new AdminSessionError("not_signed_in"));
    expect(navigate).not.toHaveBeenCalled();
  });
});
