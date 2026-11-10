import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import type { AdminSessionTokenSet } from "./sessionMemory";

const tokenSet: AdminSessionTokenSet = {
  accessToken: "session-token",
  expiresAt: Date.now() + 3_600_000,
  authUserId: "auth-a",
};
const ensureAdminSession = mock(async (): Promise<AdminSessionTokenSet> => tokenSet);
const refreshAdminSession = mock(async (): Promise<AdminSessionTokenSet> => tokenSet);
const adminSessionSnapshot = mock((): AdminSessionTokenSet | null => tokenSet);
const clearAdminSession = mock(() => {});
const logoutAdminSession = mock(async () => {});
const bootstrapAdminSession = mock(async (): Promise<AdminSessionTokenSet | null> => tokenSet);

mock.module("./sessionMemory", () => ({
  ensureAdminSession,
  refreshAdminSession,
  adminSessionSnapshot,
  clearAdminSession,
  logoutAdminSession,
  bootstrapAdminSession,
}));

const {
  AdminApiError,
  AdminHttpError,
  AdminSessionError,
  adminErrorMessage,
  adminSessionErrorText,
  fetchAdminIdentity,
  fetchAdminJson,
  getAdminAccessToken,
  requireSignedInAdminIdentity,
} = await import("./session");

const noSignedIn = () => {
  const error = new AdminSessionError("not_signed_in");
  return Promise.reject(error);
};

describe("admin browser session", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    ensureAdminSession.mockImplementation(async () => tokenSet);
    refreshAdminSession.mockImplementation(async () => tokenSet);
    adminSessionSnapshot.mockImplementation(() => tokenSet);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    ensureAdminSession.mockClear();
    refreshAdminSession.mockClear();
    clearAdminSession.mockClear();
    logoutAdminSession.mockClear();
  });

  test("returns the access token from the in-memory session store", async () => {
    await expect(getAdminAccessToken()).resolves.toBe("session-token");
    expect(ensureAdminSession).toHaveBeenCalled();
  });

  test("throws not_signed_in when the refresh cookie cannot restore a session", async () => {
    ensureAdminSession.mockImplementation(noSignedIn);
    const error = await getAdminAccessToken().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AdminSessionError);
    expect((error as InstanceType<typeof AdminSessionError>).code).toBe("not_signed_in");
  });

  test("throws identity_changed when the store belongs to another account", async () => {
    ensureAdminSession.mockImplementation(async () => ({ ...tokenSet, authUserId: "auth-b" }));
    const error = await getAdminAccessToken("auth-a").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AdminSessionError);
    expect((error as InstanceType<typeof AdminSessionError>).code).toBe("identity_changed");
  });

  test("sends JSON content type and bearer authorization", async () => {
    const fetchSpy = mock(async () => Response.json({ ok: true }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await fetchAdminJson("/api/admin/content", { method: "POST", body: "{}" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/admin/content",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer session-token",
        }),
      }),
    );
  });

  test("omits the JSON content type for a FormData body", async () => {
    const fetchSpy = mock(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ ok: true }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const formData = new FormData();
    formData.append("file", new Blob(["proof"]), "proof.pdf");
    await fetchAdminJson("/api/admin/sponsorships/pledges/p/proof", {
      method: "POST",
      body: formData,
    });

    const [, requestInit] = fetchSpy.mock.calls[0];
    expect(requestInit?.headers).not.toHaveProperty("content-type");
  });

  test("rotates the session once and retries when the server answers 401", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls += 1;
      if (calls === 1) return Response.json({ error: "expired" }, { status: 401 });
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;

    await expect(fetchAdminJson("/api/admin/content")).resolves.toEqual({ ok: true });
    expect(refreshAdminSession).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
  });

  test("a failed refresh on 401 clears the session and reports not signed in", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ error: "expired" }, { status: 401 }),
    ) as unknown as typeof fetch;
    refreshAdminSession.mockImplementation(() => Promise.reject(new Error("refresh failed")));

    const error = await fetchAdminJson("/api/admin/content").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AdminSessionError);
    expect((error as InstanceType<typeof AdminSessionError>).code).toBe("not_signed_in");
    expect(clearAdminSession).toHaveBeenCalled();
  });

  test("does not attempt a refresh when the store is already empty", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ error: "nope" }, { status: 401 }),
    ) as unknown as typeof fetch;
    adminSessionSnapshot.mockImplementation(() => null);

    const error = await fetchAdminJson("/api/admin/content").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AdminHttpError);
    expect((error as { status?: unknown }).status).toBe(401);
    expect(refreshAdminSession).not.toHaveBeenCalled();
  });

  test("preserves structured errors for a conflict response", async () => {
    globalThis.fetch = mock(async () =>
      Response.json(
        {
          error: {
            code: "conflict",
            message: "This release changed elsewhere.",
            fields: { expectedVersion: ["Reload the release and try again."] },
          },
        },
        { status: 409 },
      ),
    ) as unknown as typeof fetch;

    const error = await fetchAdminJson("/api/admin/releases/r1").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "conflict",
      message: "This release changed elsewhere.",
      fields: { expectedVersion: ["Reload the release and try again."] },
    });
  });

  test("carries the HTTP status on every error it throws", async () => {
    for (const status of [403, 404, 500]) {
      for (const response of [
        () => Response.json({ error: "Request denied." }, { status }),
        () => new Response("not json", { status }),
        () => Response.json({ error: { code: "conflict", message: "Nope." } }, { status }),
      ]) {
        globalThis.fetch = mock(async () => response()) as unknown as typeof fetch;
        const error = await fetchAdminJson("/api/admin/content").catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(Error);
        expect((error as { status?: unknown }).status).toBe(status);
      }
    }
  });

  test("a network failure keeps the error and gets a null status", async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const error = await fetchAdminJson("/api/admin/content").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TypeError);
    expect((error as { status?: unknown }).status).toBeNull();
  });

  test("leaves an aborted request without a status", async () => {
    globalThis.fetch = mock(async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;
    const error = await fetchAdminJson("/api/admin/content").catch((caught: unknown) => caught);
    expect((error as Error).name).toBe("AbortError");
    expect("status" in (error as object)).toBe(false);
  });

  test("loads admin identity through the shared admin JSON interface", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({
        admin: {
          id: "admin-row",
          authUserId: "auth-user",
          email: "admin@example.com",
          role: "admin",
          status: "active",
        },
      }),
    ) as unknown as typeof fetch;

    await expect(fetchAdminIdentity()).resolves.toMatchObject({
      admin: { authUserId: "auth-user", role: "admin" },
    });
  });

  test("session error text keeps zh-HK defaults and offers English guidance", () => {
    expect(adminSessionErrorText("not_signed_in")).toBe("未登入");
    expect(adminSessionErrorText("not_signed_in", "en")).toContain("Sign in again");
    expect(adminSessionErrorText("identity_changed", "en")).toContain("Reload");
    expect(adminErrorMessage(new AdminSessionError("not_signed_in"), "en")).toBe(
      "Not signed in. Sign in again.",
    );
  });
});

describe("requireSignedInAdminIdentity", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    ensureAdminSession.mockImplementation(async () => tokenSet);
    adminSessionSnapshot.mockImplementation(() => tokenSet);
    refreshAdminSession.mockImplementation(async () => tokenSet);
    globalThis.fetch = mock(async () =>
      Response.json({
        admin: { id: "a1", authUserId: "auth-a", email: "a@b.c", role: "admin" },
      }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("resolves the identity through the query client it is given", async () => {
    const queryClient = new QueryClient();
    const { admin } = await requireSignedInAdminIdentity(queryClient);
    expect(admin.role).toBe("admin");
  });

  test("BUG-31: a 401 identity fetch clears the session and sends the admin to sign-in", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ error: "Invalid token" }, { status: 401 }),
    ) as unknown as typeof fetch;
    logoutAdminSession.mockClear();
    const queryClient = new QueryClient();

    const thrown = await requireSignedInAdminIdentity(queryClient).catch((error: unknown) => error);

    expect(thrown).toMatchObject({ options: { to: "/admin/login" } });
    expect((thrown as { options?: { search?: unknown } }).options?.search).toBeUndefined();
    expect(logoutAdminSession).toHaveBeenCalled();
    expect(queryClient.getQueryData(["admin-me"])).toBeUndefined();
  });

  test("AUTH-02: a 403 identity fetch signs out and carries the no-access reason", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ error: "revoked" }, { status: 403 }),
    ) as unknown as typeof fetch;
    logoutAdminSession.mockClear();
    const queryClient = new QueryClient();

    const thrown = await requireSignedInAdminIdentity(queryClient).catch((error: unknown) => error);

    expect(thrown).toMatchObject({
      options: { to: "/admin/login", search: { reason: "no_admin_access" } },
    });
    expect(logoutAdminSession).toHaveBeenCalled();
    expect(queryClient.getQueryData(["admin-me"])).toBeUndefined();
  });

  test("a server failure that is not a session loss is rethrown and does not sign out", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ error: "unavailable" }, { status: 503 }),
    ) as unknown as typeof fetch;
    logoutAdminSession.mockClear();

    await expect(requireSignedInAdminIdentity(new QueryClient())).rejects.toMatchObject({
      status: 503,
    });
    expect(logoutAdminSession).not.toHaveBeenCalled();
  });

  test("no token and no refresh cookie redirects to sign-in without a request", async () => {
    ensureAdminSession.mockImplementation(noSignedIn);
    globalThis.fetch = mock(async () => {
      throw new Error("must not fetch");
    }) as unknown as typeof fetch;
    const queryClient = new QueryClient();
    queryClient.setQueryData(["admin-me"], {
      admin: { id: "a1", authUserId: "auth-a", email: "a@example.com", role: "admin" },
    });

    const thrown = await requireSignedInAdminIdentity(queryClient).catch((error: unknown) => error);
    expect(thrown).toMatchObject({ options: { to: "/admin/login" } });
    expect(queryClient.getQueryData(["admin-me"])).toBeUndefined();
  });

  test("reloads the identity when the session store names a different account", async () => {
    let authUserId = "auth-a";
    ensureAdminSession.mockImplementation(async () => ({ ...tokenSet, authUserId }));
    globalThis.fetch = mock(async () =>
      Response.json({
        admin: { id: authUserId, authUserId, email: `${authUserId}@example.com`, role: "staff" },
      }),
    ) as unknown as typeof fetch;

    const queryClient = new QueryClient();
    expect((await requireSignedInAdminIdentity(queryClient)).admin.authUserId).toBe("auth-a");
    authUserId = "auth-b";
    expect((await requireSignedInAdminIdentity(queryClient)).admin.authUserId).toBe("auth-b");
  });

  test("a second call on the same client issues no second request", async () => {
    let calls = 0;
    ensureAdminSession.mockClear();
    globalThis.fetch = mock(async () => {
      calls += 1;
      return Response.json({
        admin: { id: "a1", authUserId: "auth-a", email: "a@b.c", role: "admin" },
      });
    }) as unknown as typeof fetch;

    const queryClient = new QueryClient();
    await requireSignedInAdminIdentity(queryClient);
    await requireSignedInAdminIdentity(queryClient);
    expect(calls).toBe(1);
  });
});
