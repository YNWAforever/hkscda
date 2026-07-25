import { describe, expect, test } from "bun:test";

import { createGroupEnquiryRouteHandler } from "./group-enquiries";

function request(body: unknown, init: RequestInit = {}) {
  return new Request("https://example.test/api/volunteer/group-enquiries", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.8" },
    ...init,
  });
}

const payload = {
  organisationName: "Happy School",
  contactPerson: "Ms Chan",
  email: "lead@example.com",
  phone: "91234567",
  activityType: "school_talk",
  participantCount: 30,
  idempotencyKey: "11111111-2222-4333-8444-555555555555",
  turnstileToken: "token",
};

describe("group enquiry public route handler", () => {
  test("rejects unsupported methods and malformed JSON before service work", async () => {
    const calls: string[] = [];
    const handler = createGroupEnquiryRouteHandler({
      submitPublicEnquiry: async () => {
        calls.push("service");
        return { ok: true, enquiryId: "enquiry-1" };
      },
      verifyTurnstileToken: async () => true,
      enforceRateLimitForRequest: async () => ({ ok: true }),
    });

    expect((await handler({ request: request(payload, { method: "GET" }) })).status).toBe(405);
    const malformed = await handler({ request: request("{") });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Invalid JSON body" });
    expect(calls).toEqual([]);
  });

  test("applies rate limiting and Turnstile before persistence", async () => {
    const calls: string[] = [];
    const limited = createGroupEnquiryRouteHandler({
      submitPublicEnquiry: async () => {
        calls.push("service");
        return { ok: true, enquiryId: "enquiry-1" };
      },
      verifyTurnstileToken: async () => true,
      enforceRateLimitForRequest: async () => ({ ok: false, reset: Date.now() + 30_000 }),
    });
    const rateResponse = await limited({ request: request(payload) });
    expect(rateResponse.status).toBe(429);
    expect(rateResponse.headers.get("retry-after")).toBe("30");

    const unverified = createGroupEnquiryRouteHandler({
      submitPublicEnquiry: async () => {
        calls.push("service");
        return { ok: true, enquiryId: "enquiry-1" };
      },
      verifyTurnstileToken: async () => false,
      enforceRateLimitForRequest: async () => ({ ok: true }),
    });
    const turnstileResponse = await unverified({ request: request(payload) });
    expect(turnstileResponse.status).toBe(403);
    expect(calls).toEqual([]);
  });

  test("returns neutral no-store success after service persistence", async () => {
    const calls: unknown[] = [];
    const handler = createGroupEnquiryRouteHandler({
      submitPublicEnquiry: async (input) => {
        calls.push(input);
        return { ok: true, enquiryId: "enquiry-1" };
      },
      verifyTurnstileToken: async (token, ip) => {
        calls.push({ token, ip });
        return true;
      },
      enforceRateLimitForRequest: async () => ({ ok: true }),
    });

    const response = await handler({ request: request(payload) });
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
    expect(calls).toContainEqual({ token: "token", ip: "203.0.113.8" });
    expect(calls[1]).toMatchObject({ organisationName: "Happy School", idempotencyKey: payload.idempotencyKey });
  });
});
