import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

const getSession = mock(
  async (): Promise<{ data: { session: { access_token: string } | null } }> => ({
    data: { session: { access_token: "session-token" } },
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
  fetchAdminIdentity,
  fetchAdminJson,
  getAdminAccessToken,
  requireSignedInAdminIdentity,
} = await import("./session");

describe("admin browser session", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
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

describe("requireSignedInAdminIdentity", () => {
  const originalFetch = globalThis.fetch;
  let calls: number;

  beforeEach(() => {
    calls = 0;
    globalThis.fetch = mock(async () => {
      calls += 1;
      return new Response(JSON.stringify({ admin: { id: "a1", email: "a@b.c", role: "admin" } }), {
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    getSession.mockResolvedValue({ data: { session: { access_token: "session-token" } } });
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

  test("redirects to login when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const queryClient = new QueryClient();
    await expect(requireSignedInAdminIdentity(queryClient)).rejects.toBeDefined();
    expect(calls).toBe(0);
  });
});
