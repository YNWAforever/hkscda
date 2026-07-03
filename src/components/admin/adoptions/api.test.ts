import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const getSession = mock(
  async (): Promise<{ data: { session: { access_token: string } | null } }> => ({
    data: { session: { access_token: "session-token" } },
  }),
);

mock.module("../../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession,
    },
  },
}));

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

  test("does not force a JSON content-type when the body is FormData", async () => {
    const fetchSpy = mock(async () => Response.json({ ok: true }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const formData = new FormData();
    formData.set("payload", "{}");

    await fetchCoordinatorJson("/api/admin/sponsorships/pledges/pledge-1/proof", {
      method: "POST",
      body: formData,
    });

    const [, requestInit] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const headers = requestInit.headers as Record<string, string>;
    expect(requestInit.body).toBe(formData);
    expect(headers["content-type"]).toBeUndefined();
    expect(headers.authorization).toBe("Bearer session-token");
  });

  test("still defaults to JSON content type for non-FormData bodies", async () => {
    const fetchSpy = mock(async () => Response.json({ ok: true }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await fetchCoordinatorJson("/api/admin/adoptions/statuses", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
    });

    const [, requestInit] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const headers = requestInit.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
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
