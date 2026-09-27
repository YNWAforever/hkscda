import { expect, test } from "bun:test";
import { createRecoveryRouteHandler } from "./recovery";

const url = "https://example.invalid/api/supporter/recovery";

test("recovery route is no-store and returns the same generic result", async () => {
  const emails: string[] = [];
  const handle = createRecoveryRouteHandler(() => ({
    ip: "203.0.113.4",
    rate: async () => ({ ok: true }),
    challenge: async () => true,
    sendOtp: async (email) => {
      emails.push(email);
    },
  }));
  for (const email of ["known@example.invalid", "unknown@example.invalid"]) {
    const response = await handle({
      request: new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, challengeToken: "fixture" }),
      }),
    });
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ accepted: true });
  }
  expect(emails).toEqual(["known@example.invalid", "unknown@example.invalid"]);
});

test("recovery route fails closed when the limiter is unavailable", async () => {
  const handle = createRecoveryRouteHandler(() => ({
    ip: "203.0.113.4",
    rate: async () => ({ ok: false, unavailable: true }),
    challenge: async () => true,
    sendOtp: async () => {
      throw new Error("should not send");
    },
  }));
  const response = await handle({
    request: new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.invalid" }),
    }),
  });
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
