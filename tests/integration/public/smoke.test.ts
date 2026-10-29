import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Smoke checks for the public API surface. Every handler is called for real with
 * a fake Supabase, no provider secrets and no Turnstile/Upstash configuration
 * (the local/preview posture). The suite pins the edges that must never regress:
 * hostile or broken input gets a 4xx rather than a 500, scheduled jobs refuse callers
 * without `CRON_SECRET`, bearer status links do not resolve for an unknown token, and
 * an unsigned webhook is never accepted.
 */

const FAKE_SUPABASE = "http://fake-supabase.invalid";

type Handler = (context: {
  request: Request;
  params: Record<string, string>;
  context: Record<string, never>;
}) => Promise<Response> | Response;
type RouteModule = { Route?: { options?: { server?: { handlers?: Record<string, Handler> } } } };

const savedEnv: Record<string, string | undefined> = {};
let originalFetch: typeof fetch;

beforeAll(() => {
  const env = {
    SUPABASE_URL: FAKE_SUPABASE,
    VITE_SUPABASE_URL: FAKE_SUPABASE,
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    VITE_SUPABASE_ANON_KEY: "test-anon-key",
    CRON_SECRET: "test-cron-secret",
  };
  for (const [key, value] of Object.entries(env)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
  originalFetch = globalThis.fetch;
  // Reads come back empty; nothing reaches a real network.
  const fakeFetch = () => Promise.resolve(Response.json([]));
  globalThis.fetch = Object.assign(fakeFetch, { preconnect: originalFetch.preconnect });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function handlerFor(path: string, method: string): Promise<Handler> {
  const root = new URL("../../../", import.meta.url).pathname;
  const mod = (await import(`${root}src/routes/api/${path}`)) as RouteModule;
  const handler = mod.Route?.options?.server?.handlers?.[method];
  if (!handler) throw new Error(`${method} ${path} has no handler`);
  return handler;
}

async function statusOf(path: string, method: string, init: RequestInit = {}) {
  const handler = await handlerFor(path, method);
  const request = new Request("http://localhost:3000/api/smoke", { method, ...init });
  const params = new Proxy<Record<string, string>>({}, { get: () => "unknown-token-value" });
  try {
    return (await handler({ request, params, context: {} })).status;
  } catch (error) {
    return error instanceof Response ? error.status : 500;
  }
}

const json = (body: string): RequestInit => ({
  body,
  headers: { "content-type": "application/json" },
});

describe("public form endpoints reject broken input with a 4xx", () => {
  const FORMS = [
    "adoption/applications.ts",
    "adoption/applications/photo-upload-urls.ts",
    "donations.ts",
    "help/search-gap.ts",
    "sponsorships/pledges.ts",
    "sponsorships/pledges/proof-upload-url.ts",
    "volunteer/group-enquiries.ts",
    "volunteer/registrations.ts",
  ];
  for (const path of FORMS) {
    test(`POST ${path}: malformed JSON and empty object`, async () => {
      expect(await statusOf(path, "POST", json("not json{"))).toBe(400);
      expect(await statusOf(path, "POST", json("{}"))).toBe(400);
    });
  }

  test("POST csp-report refuses a non-report content type", async () => {
    expect(await statusOf("csp-report.ts", "POST", json("{}"))).toBe(415);
  });
});

describe("signed-in public endpoints refuse anonymous callers", () => {
  const ENDPOINTS: [string, string][] = [
    ["internships/attachment.ts", "GET"],
    ["internships/attachment.ts", "POST"],
    ["internships/index.ts", "POST"],
    ["supporter/preferences.ts", "POST"],
    ["supporter/records.ts", "GET"],
    ["volunteer/operations.ts", "POST"],
    ["volunteer/policy.ts", "POST"],
  ];
  for (const [path, method] of ENDPOINTS) {
    test(`${method} ${path}`, async () => {
      expect(await statusOf(path, method, method === "GET" ? {} : json("{}"))).toBe(401);
    });
  }
});

describe("scheduled jobs and readiness require CRON_SECRET", () => {
  const JOBS = [
    "internal/readiness.ts",
    "jobs/adoption-uploads.ts",
    "jobs/crm-exports.ts",
    "jobs/donations.ts",
    "jobs/public-media-repair.ts",
    "jobs/public-uploads.ts",
    "jobs/sponsorships.ts",
    "jobs/volunteers.ts",
  ];
  for (const path of JOBS) {
    test(`GET ${path}`, async () => {
      expect(await statusOf(path, "GET")).toBe(401);
      expect(
        await statusOf(path, "GET", { headers: { authorization: "Bearer wrong-secret" } }),
      ).toBe(401);
    });
  }
});

describe("bearer status links do not resolve for an unknown token", () => {
  const LINKS = [
    "adoption/status/$token.ts",
    "donations/$donationId/status.ts",
    "sponsorships/status/$token.ts",
    "supporter/receipts/$receiptId.ts",
    "volunteer/status/$token.ts",
  ];
  for (const path of LINKS) {
    test(`GET ${path}`, async () => {
      expect(await statusOf(path, "GET")).toBe(404);
    });
  }
});

describe("webhooks never accept an unsigned payload", () => {
  const WEBHOOKS = [
    "webhooks/cod.ts",
    "webhooks/paypal.ts",
    "webhooks/resend.ts",
    "webhooks/stripe.ts",
  ];
  for (const path of WEBHOOKS) {
    test(`POST ${path}`, async () => {
      for (const body of ["not json{", "{}", JSON.stringify({ type: "payment.succeeded" })]) {
        const status = await statusOf(path, "POST", json(body));
        expect(status >= 400, `${path} answered ${status} for ${body}`).toBe(true);
      }
    });
  }
});
