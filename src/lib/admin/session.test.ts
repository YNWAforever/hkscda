import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

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

const { fetchAdminIdentity, fetchAdminJson, getAdminAccessToken } = await import("./session");

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
