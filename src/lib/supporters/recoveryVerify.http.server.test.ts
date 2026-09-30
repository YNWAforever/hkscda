import { expect, test } from "bun:test";
import { createRecoveryVerificationHandler } from "./recoveryVerify.http.server";
import { RecoveryError } from "./recovery.server";

const body = {
  email: "a@example.invalid",
  challengeId: "12345678-1234-4234-8234-123456789012",
  code: "12345678",
  challengeToken: "synthetic",
};
const request = (value: unknown = body) =>
  new Request("https://example.invalid/api/supporter/recovery/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
function fixture(enabled = true) {
  const attempts: unknown[] = [];
  const handle = createRecoveryVerificationHandler(
    () => ({
      ip: "203.0.113.4",
      rate: async () => ({ ok: true }),
      challenge: async () => true,
      verify: async (input) => {
        attempts.push(input);
        return { access_token: "synthetic", refresh_token: "synthetic-refresh" };
      },
    }),
    { enabled: () => enabled },
  );
  return { handle, attempts };
}
test("verification stays disabled with zero provider calls", async () => {
  const f = fixture(false);
  const response = await f.handle({ request: request() });
  expect(response.status).toBe(503);
  expect(f.attempts).toHaveLength(0);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
test("verified response contains only session tokens and is never cached", async () => {
  const f = fixture();
  const response = await f.handle({ request: request({ ...body, email: " A@example.invalid " }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    access_token: "synthetic",
    refresh_token: "synthetic-refresh",
  });
  expect(f.attempts).toEqual([
    { email: "a@example.invalid", challengeId: body.challengeId, code: body.code },
  ]);
});
test("invalid JSON shapes do not reach verification", async () => {
  const f = fixture();
  for (const value of [
    null,
    [],
    { ...body, code: 12345678 },
    { ...body, challengeId: null },
    { ...body, challengeToken: 1 },
  ]) {
    expect((await f.handle({ request: request(value) })).status).toBe(400);
  }
  expect(f.attempts).toHaveLength(0);
});
test("challenge refusal and unavailable rate limit never reach verification", async () => {
  for (const unavailable of [true, false]) {
    let calls = 0;
    const handle = createRecoveryVerificationHandler(
      () => ({
        ip: "203.0.113.4",
        rate: async () => (unavailable ? { ok: false, unavailable: true } : { ok: true }),
        challenge: async () => false,
        verify: async () => {
          calls++;
          return { access_token: "synthetic", refresh_token: "synthetic" };
        },
      }),
      { enabled: () => true },
    );
    expect((await handle({ request: request() })).status).toBe(unavailable ? 503 : 403);
    expect(calls).toBe(0);
  }
});

test("malformed JSON, body limit and method preserve their public HTTP boundaries", async () => {
  const f = fixture();
  expect(
    (
      await f.handle({
        request: new Request("https://example.invalid", { method: "POST", body: "{" }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.handle({
        request: new Request("https://example.invalid", {
          method: "POST",
          body: "x".repeat(1024 * 1024 + 1),
        }),
      })
    ).status,
  ).toBe(413);
  expect((await f.handle({ request: new Request("https://example.invalid") })).status).toBe(405);
  expect(f.attempts).toHaveLength(0);
});

for (const invalid of [true, false]) {
  test(`${invalid ? "invalid code" : "unexpected provider failure"} never leaks identity or provider details`, async () => {
    const handle = createRecoveryVerificationHandler(
      () => ({
        ip: "203.0.113.4",
        rate: async () => ({ ok: true }),
        challenge: async () => true,
        verify: async () => {
          throw invalid
            ? new RecoveryError("invalid_code")
            : new Error("secret email a@example.invalid");
        },
      }),
      { enabled: () => true },
    );
    const response = await handle({ request: request() });
    expect(response.status).toBe(invalid ? 401 : 503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("a@example.invalid");
  });
}
