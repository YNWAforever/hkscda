import { afterAll, beforeEach, expect, mock, test } from "bun:test";
const originalFetch = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = originalFetch;
});
let actor = "A",
  requests = 0;
mock.module("../supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "token-" + actor, user: { id: actor } } },
      }),
    },
  },
}));
const { fetchAdminJson } = await import("./session");
beforeEach(() => {
  actor = "A";
  requests = 0;
});
test("an actor-bound request cannot use another live actor's bearer token", async () => {
  actor = "B";
  globalThis.fetch = Object.assign(
    async () => {
      requests++;
      return Response.json({ operationId: "B" });
    },
    { preconnect: () => {} },
  );
  await expect(fetchAdminJson("/api/admin/fixture", { method: "POST" }, "A")).rejects.toThrow(
    "登入身份已變更",
  );
  expect(requests).toBe(0);
});
test("actor-bound HTTP uses the matching token and returns the confirmed result", async () => {
  globalThis.fetch = Object.assign(
    async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      requests++;
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-A");
      return Response.json({ operationId: "A" });
    },
    { preconnect: () => {} },
  );
  expect(await fetchAdminJson<{ operationId: string }>("/api/admin/fixture", {}, "A")).toEqual({
    operationId: "A",
  });
  expect(requests).toBe(1);
});
test("an account change while a response is held rejects the old actor result", async () => {
  let finish!: (response: Response) => void;
  globalThis.fetch = Object.assign(
    () => {
      requests++;
      return new Promise<Response>((r) => (finish = r));
    },
    { preconnect: () => {} },
  );
  const pending = fetchAdminJson("/api/admin/fixture", { method: "POST" }, "A");
  await new Promise((r) => setTimeout(r, 0));
  actor = "B";
  finish(Response.json({ operationId: "A" }));
  await expect(pending).rejects.toThrow("登入身份已變更");
  expect(requests).toBe(1);
});
