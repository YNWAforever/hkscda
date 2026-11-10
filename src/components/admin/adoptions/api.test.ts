import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const getSession = mock(
  async (): Promise<{ data: { session: { access_token: string } | null } }> => ({
    data: { session: { access_token: "session-token" } },
  }),
);

mock.module("../../../lib/admin/sessionMemory", () => {
  const tokenSet = async () => {
    const { data } = await getSession();
    if (!data.session?.access_token) throw new Error("not signed in");
    return {
      accessToken: data.session.access_token,
      expiresAt: Date.now() + 3_600_000,
      authUserId: "auth-a",
    };
  };
  return {
    ensureAdminSession: tokenSet,
    refreshAdminSession: tokenSet,
    adminSessionSnapshot: () => ({
      accessToken: "session-token",
      expiresAt: Date.now() + 3_600_000,
      authUserId: "auth-a",
    }),
    clearAdminSession: () => {},
    logoutAdminSession: async () => {},
  };
});

const { fetchCoordinatorJson } = await import("./api");

describe("fetchCoordinatorJson", () => {
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

  test("throws 未登入 before fetch when there is no access token", async () => {
    const fetchSpy = mock(async () => new Response("{}"));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(fetchCoordinatorJson("/api/admin/adoptions/statuses")).rejects.toThrow("未登入");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("sends JSON content type and bearer authorization", async () => {
    const fetchSpy = mock(async () => Response.json({ statuses: [] }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await fetchCoordinatorJson("/api/admin/adoptions/statuses", { method: "POST", body: "{}" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/admin/adoptions/statuses",
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

  test("throws API error JSON message", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ error: "Invalid status" }, { status: 400 }),
    ) as unknown as typeof fetch;

    await expect(fetchCoordinatorJson("/api/admin/adoptions/statuses")).rejects.toThrow(
      "Invalid status",
    );
  });
});
