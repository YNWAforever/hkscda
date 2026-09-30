import { expect, test } from "bun:test";
import { createRecoveryRouteHandler } from "./recovery";
const url = "https://example.invalid/api/supporter/recovery";
for (const [name, status, rate, challenge] of [
  ["rate limit", 429, { ok: false, reset: 1600 }, true],
  ["limiter unavailable", 503, { ok: false, unavailable: true }, true],
  ["invalid challenge", 403, { ok: true }, false],
] as const) {
  test(`${name} never sends OTP and is no-store`, async () => {
    let sends = 0;
    const handle = createRecoveryRouteHandler(
      () => ({
        ip: "203.0.113.8",
        rate: async () => rate,
        challenge: async () => challenge,
        sendOtp: async () => {
          sends++;
        },
      }),
      { enabled: () => true, now: () => 1000 },
    );
    const response = await handle({
      request: new Request(url, {
        method: "POST",
        body: JSON.stringify({ email: "a@example.invalid", challengeToken: "synthetic" }),
      }),
    });
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    if (status === 429) expect(response.headers.get("retry-after")).toBe("1");
    expect(sends).toBe(0);
  });
}
for (const [name, method, body, status] of [
  ["wrong method", "GET", undefined, 405],
  ["malformed JSON", "POST", "{", 400],
  ["array", "POST", "[]", 400],
  ["bad email type", "POST", '{"email":3}', 400],
  ["bad token type", "POST", '{"email":"a@example.invalid","challengeToken":[]}', 400],
  ["oversized body without content-length", "POST", "x".repeat(1024 * 1024 + 1), 413],
] as const) {
  test(`${name} is rejected before dependencies`, async () => {
    let dependencies = 0;
    const handle = createRecoveryRouteHandler(
      () => {
        dependencies++;
        throw new Error("must not instantiate");
      },
      { enabled: () => true },
    );
    const response = await handle({
      request: new Request(url, { method, ...(body === undefined ? {} : { body }) }),
    });
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(dependencies).toBe(0);
  });
}
test("provider and unexpected failures never leak input or provider details", async () => {
  const service = {
    ip: "203.0.113.8",
    rate: async () => ({ ok: true }),
    challenge: async () => true,
    sendOtp: async () => {
      throw new Error("SECRET_PROVIDER_DETAIL");
    },
  };
  const request = () =>
    new Request(url, {
      method: "POST",
      body: JSON.stringify({ email: "private@example.invalid" }),
    });
  const response = await createRecoveryRouteHandler(() => service, { enabled: () => true })({
    request: request(),
  });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({
    accepted: true,
    challengeId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  const unavailable = await createRecoveryRouteHandler(
    () => {
      throw new Error("SECRET_PROVIDER_DETAIL");
    },
    { enabled: () => true },
  )({ request: request() });
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toEqual({ error: "Temporarily unavailable" });
});
