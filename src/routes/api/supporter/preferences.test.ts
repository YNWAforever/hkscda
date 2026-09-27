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
