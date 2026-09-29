import { expect, test } from "bun:test";
import { createPreferenceHandler } from "./preferences";

const url = "https://example.invalid/api/supporter/preferences";

test("only verified bearer can explicitly change marketing, without caller identity fields", async () => {
  const seen: Array<{ email: string; status: string }> = [];
  const handle = createPreferenceHandler({
    auth: {
      getUser: async (token) => ({
        data: {
          user:
            token === "owner"
              ? { id: "u1", email: "owner@example.invalid", email_confirmed_at: "2026-09-27" }
              : null,
        },
        error: null,
      }),
    },
    rate: async () => ({ ok: true }),
    update: async (principal, status) => {
      seen.push({ email: principal.email, status });
      return { status, changed: true };
    },
  });
  const body = JSON.stringify({ marketingEmail: "opt_out", supporterId: "other" });
  const missing = await handle({
    request: new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  });
  expect(missing.status).toBe(401);
  const owner = await handle({
    request: new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer owner" },
      body,
    }),
  });
  expect(owner.status).toBe(200);
  expect(owner.headers.get("cache-control")).toBe("no-store");
  expect(seen).toEqual([{ email: "owner@example.invalid", status: "opt_out" }]);
});

for (const [body, status] of [
  ["{", 400],
  ["x".repeat(1024 * 1024 + 1), 413],
] as const) {
  test(`invalid preference request returns ${status} without a mutation`, async () => {
    let mutations = 0;
    const handle = createPreferenceHandler({
      auth: {
        getUser: async () => ({
          data: {
            user: { id: "u1", email: "owner@example.invalid", email_confirmed_at: "2026-09-27" },
          },
          error: null,
        }),
      },
      rate: async () => ({ ok: true }),
      update: async (_principal, preference) => {
        mutations++;
        return { status: preference, changed: true };
      },
    });
    const response = await handle({
      request: new Request(url, {
        method: "POST",
        headers: { authorization: "Bearer owner" },
        body,
      }),
    });
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mutations).toBe(0);
  });
}
