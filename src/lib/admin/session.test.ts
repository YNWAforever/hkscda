import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

const getSession = mock(
  async (): Promise<{
    data: { session: { access_token: string; user: { id: string } } | null };
  }> => ({
    data: { session: { access_token: "session-token", user: { id: "auth-a" } } },
  }),
);

mock.module("../supabase", () => ({
  supabase: {
    auth: {
      getSession,
    },
  },
}));

const {
  AdminApiError,
  AdminSessionError,
  adminErrorMessage,
  adminSessionErrorText,
  fetchAdminIdentity,
  fetchAdminJson,
  getAdminAccessToken,
  requireSignedInAdminIdentity,
} = await import("./session");

describe("admin browser session", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "session-token", user: { id: "auth-a" } } },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    getSession.mockClear();
  });

  test("returns the current Supabase access token", async () => {
    await expect(getAdminAccessToken()).resolves.toBe("session-token");
  });

  test("throws before fetch when there is no admin access token", async () => {
    const fetchSpy = mock(async () => new Response("{}"));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(fetchAdminJson("/api/admin/me")).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
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

  test("omits the JSON content type for a FormData body so the browser can set its own multipart boundary", async () => {
    const fetchSpy = mock(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ ok: true }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const formData = new FormData();
    formData.append("file", new Blob(["proof"]), "proof.pdf");

    await fetchAdminJson("/api/admin/sponsorships/pledges/pledge-1/proof", {
      method: "POST",
      body: formData,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/admin/sponsorships/pledges/pledge-1/proof",
      expect.objectContaining({
        method: "POST",
        body: formData,
        headers: expect.objectContaining({
          authorization: "Bearer session-token",
        }),
      }),
    );
    const [, requestInit] = fetchSpy.mock.calls[0];
    expect(requestInit?.headers).not.toHaveProperty("content-type");
  });

  test("preserves structured safe errors for a conflict response", async () => {
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

    const error = await fetchAdminJson("/api/admin/adoption-guide-releases/release-1").catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      status: 409,
      code: "conflict",
      message: "This release changed elsewhere.",
      fields: { expectedVersion: ["Reload the release and try again."] },
    });
  });

  test("keeps string error messages compatible", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ error: "Request denied." }, { status: 403 }),
    ) as unknown as typeof fetch;

    await expect(fetchAdminJson("/api/admin/content")).rejects.toThrow("Request denied.");
  });

  test("uses the generic error for malformed error bodies", async () => {
    globalThis.fetch = mock(
      async () => new Response("not json", { status: 500 }),
    ) as unknown as typeof fetch;

    await expect(fetchAdminJson("/api/admin/content")).rejects.toThrow("API request failed");
  });

  test("carries the HTTP status on every error it throws", async () => {
    for (const status of [401, 403, 404, 500]) {
      // A plain string error body, a malformed body and a structured body all keep the status.
      for (const response of [
        () => Response.json({ error: "Request denied." }, { status }),
        () => new Response("not json", { status }),
        () => Response.json({ error: { code: "conflict", message: "Nope." } }, { status }),
      ]) {
        globalThis.fetch = mock(async () => response()) as unknown as typeof fetch;
        const error = await fetchAdminJson("/api/admin/content").catch((reason: unknown) => reason);
        expect(error).toBeInstanceOf(Error);
        expect((error as { status?: unknown }).status).toBe(status);
      }
    }
  });

  test("keeps the status on a volunteers path error", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({}, { status: 403 }),
    ) as unknown as typeof fetch;
    const error = await fetchAdminJson("/api/admin/volunteers/activities").catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(AdminApiError);
    expect((error as { status?: unknown }).status).toBe(403);
  });

  test("gives a null status for a network failure and keeps the error as it was", async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const error = await fetchAdminJson("/api/admin/content").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe("Failed to fetch");
    expect((error as { status?: unknown }).status).toBeNull();
  });

  test("wraps a network error whose own status cannot be redefined, without throwing", async () => {
    globalThis.fetch = mock(async () => {
      const error = new TypeError("Failed to fetch");
      Object.defineProperty(error, "status", { value: 0, configurable: false, writable: false });
      throw error;
    }) as unknown as typeof fetch;
    const error = await fetchAdminJson("/api/admin/content").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Failed to fetch");
    expect((error as { status?: unknown }).status).toBeNull();
  });

  test("wraps a network error that cannot carry a status, with the same message", async () => {
    globalThis.fetch = mock(async () => {
      throw Object.freeze(new TypeError("Failed to fetch"));
    }) as unknown as typeof fetch;
    const error = await fetchAdminJson("/api/admin/content").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Failed to fetch");
    expect((error as { status?: unknown }).status).toBeNull();
  });

  test("leaves an aborted request without a status", async () => {
    globalThis.fetch = mock(async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;
    const error = await fetchAdminJson("/api/admin/content").catch((reason: unknown) => reason);
    expect((error as Error).name).toBe("AbortError");
    expect("status" in (error as object)).toBe(false);
  });

  test("omits unsafe structured error codes and invalid field collections", async () => {
    globalThis.fetch = mock(async () =>
      Response.json(
        {
          error: {
            code: "conflict;drop",
            message: "Review the request.",
            fields: {
              expectedVersion: "Reload first.",
              topic: ["Required.", 42],
            },
          },
        },
        { status: 400 },
      ),
    ) as unknown as typeof fetch;

    const error = await fetchAdminJson("/api/admin/content").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({
      status: 400,
      message: "Review the request.",
    });
    expect((error as InstanceType<typeof AdminApiError>).code).toBeUndefined();
    expect((error as InstanceType<typeof AdminApiError>).fields).toBeUndefined();
  });

  test("keeps only validated structured error fields", async () => {
    globalThis.fetch = mock(async () =>
      Response.json(
        {
          error: {
            code: "validation_error",
            message: "Review the highlighted fields.",
            fields: {
              topic: ["Topic is required."],
              expectedVersion: "Reload first.",
              mixed: ["Safe-looking text", null],
            },
          },
        },
        { status: 400 },
      ),
    ) as unknown as typeof fetch;

    const error = await fetchAdminJson("/api/admin/content").catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      code: "validation_error",
      fields: { topic: ["Topic is required."] },
    });
  });
  test("loads admin identity through the shared admin JSON interface", async () => {
    const fetchSpy = mock(async () =>
      Response.json({
        admin: {
          id: "admin-row",
          authUserId: "auth-user",
          email: "admin@example.com",
          role: "admin",
          status: "active",
        },
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(fetchAdminIdentity()).resolves.toEqual({
      admin: {
        id: "admin-row",
        authUserId: "auth-user",
        email: "admin@example.com",
        role: "admin",
        status: "active",
      },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/admin/me",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer session-token" }),
      }),
    );
  });
});

describe("session errors", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: null } });
  });

  afterEach(() => {
    getSession.mockClear();
  });

  test("a missing session keeps its zh-HK message and carries a code", async () => {
    const error = await getAdminAccessToken().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AdminSessionError);
    expect(error).toBeInstanceOf(Error);
    expect((error as InstanceType<typeof AdminSessionError>).code).toBe("not_signed_in");
    expect((error as Error).message).toBe("未登入");
  });

  test("a missing session reads as a 401", async () => {
    const error = await getAdminAccessToken().catch((caught: unknown) => caught);
    expect((error as InstanceType<typeof AdminSessionError>).status).toBe(401);
  });

  test("a changed account keeps its zh-HK message and carries a code and a 401", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "token-b", user: { id: "auth-b" } } },
    });
    const error = await getAdminAccessToken("auth-a").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AdminSessionError);
    expect((error as InstanceType<typeof AdminSessionError>).code).toBe("identity_changed");
    expect((error as Error).message).toBe("登入身份已變更，請重新載入頁面。");
    expect((error as InstanceType<typeof AdminSessionError>).status).toBe(401);
  });

  test("adminErrorMessage translates a session error and leaves other messages as sent", () => {
    const notSignedIn = new AdminSessionError("not_signed_in");
    expect(adminErrorMessage(notSignedIn)).toBe("未登入");
    expect(adminErrorMessage(notSignedIn, "zh")).toBe("未登入");
    expect(adminErrorMessage(notSignedIn, "en")).toBe("Not signed in. Sign in again.");
    expect(adminErrorMessage(new AdminSessionError("identity_changed"), "en")).toBe(
      "Your signed-in account has changed. Reload the page.",
    );
    expect(adminErrorMessage(new Error("Invalid JSON body"), "en")).toBe("Invalid JSON body");
    expect(adminErrorMessage("not an error", "en")).toBeNull();
  });

  test("the English session text has no Chinese and tells the user what to do", () => {
    for (const code of ["not_signed_in", "identity_changed"] as const) {
      expect(adminSessionErrorText(code, "en")).not.toMatch(/\p{Script=Han}/u);
    }
    expect(adminSessionErrorText("identity_changed", "en")).toContain("Reload");
    expect(adminSessionErrorText("not_signed_in", "en")).toContain("Sign in again");
    // ExportBar compares the zh message with this exact text.
    expect(adminSessionErrorText("not_signed_in", "zh")).toBe("未登入");
    expect(adminSessionErrorText("not_signed_in")).toBe("未登入");
  });
});

describe("requireSignedInAdminIdentity", () => {
  const originalFetch = globalThis.fetch;
  let calls: number;

  beforeEach(() => {
    calls = 0;
    globalThis.fetch = mock(async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          admin: { id: "a1", authUserId: "auth-a", email: "a@b.c", role: "admin" },
        }),
        {
          headers: { "content-type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;
    getSession.mockResolvedValue({
      data: { session: { access_token: "session-token", user: { id: "auth-a" } } },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("resolves the identity through the query client it is given", async () => {
    const queryClient = new QueryClient();
    const { admin } = await requireSignedInAdminIdentity(queryClient);
    expect(admin.role).toBe("admin");
    expect(calls).toBe(1);
  });

  test("a second call on the same client issues no second request", async () => {
    // This is the duplicate GET /api/admin/me: beforeLoad primes the entry and
    // AdminLayout reads it back.
    const queryClient = new QueryClient();
    await requireSignedInAdminIdentity(queryClient);
    await requireSignedInAdminIdentity(queryClient);
    expect(calls).toBe(1);
  });

  test("reloads identity when a different admin signs in on the same query client", async () => {
    let authUserId = "auth-a";
    getSession.mockImplementation(async () => ({
      data: { session: { access_token: `token-${authUserId}`, user: { id: authUserId } } },
    }));
    globalThis.fetch = mock(async () => {
      calls += 1;
      return Response.json({
        admin: { id: authUserId, authUserId, email: `${authUserId}@example.com`, role: "staff" },
      });
    }) as unknown as typeof fetch;

    const queryClient = new QueryClient();
    expect((await requireSignedInAdminIdentity(queryClient)).admin.authUserId).toBe("auth-a");
    authUserId = "auth-b";
    expect((await requireSignedInAdminIdentity(queryClient)).admin.authUserId).toBe("auth-b");
    expect(calls).toBe(2);
  });

  test("clears cached admin identity when the session has ended", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["admin-me"], {
      admin: { id: "a1", authUserId: "auth-a", email: "a@example.com", role: "admin" },
    });
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(requireSignedInAdminIdentity(queryClient)).rejects.toBeDefined();
    expect(queryClient.getQueryData(["admin-me"])).toBeUndefined();
    expect(calls).toBe(0);
  });

  test("redirects to login when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const queryClient = new QueryClient();
    await expect(requireSignedInAdminIdentity(queryClient)).rejects.toBeDefined();
    expect(calls).toBe(0);
  });
});
