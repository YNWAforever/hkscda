import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  canRoleAccessAdminArea,
  type AdminAccessArea,
  type AdminRole,
} from "../../../src/lib/admin/access";

/**
 * Runtime authorization sweep over every admin API route.
 *
 * Each handler is called for real against a fake Supabase that answers only the two
 * requests `requireAdmin` makes (`auth/v1/user` and the `admin_user` lookup) and fails
 * everything else. That proves, per route and method, what a static grep cannot: about
 * half the routes reach `requireAdmin` through a shared handler module, not directly.
 *
 * "Allowed" means the response was neither 401 nor 403. An allowed call then fails on
 * the fake database, which is fine: this suite is about who gets past the gate.
 */

const FAKE_SUPABASE = "http://fake-supabase.invalid";
const RECORD_ID = "11111111-1111-4111-8111-111111111111";
const ROLES: AdminRole[] = ["staff", "treasurer", "admin"];

type Caller = AdminRole | "anonymous" | "invalid" | "non-admin" | "disabled" | "pending";
type AdminRow = { role: AdminRole; status: "active" | "disabled" | "pending" } | null;

const USERS: Record<string, { id: string; row: AdminRow }> = {
  staff: { id: "00000000-0000-4000-8000-000000000001", row: { role: "staff", status: "active" } },
  treasurer: {
    id: "00000000-0000-4000-8000-000000000002",
    row: { role: "treasurer", status: "active" },
  },
  admin: { id: "00000000-0000-4000-8000-000000000003", row: { role: "admin", status: "active" } },
  disabled: {
    id: "00000000-0000-4000-8000-000000000004",
    row: { role: "admin", status: "disabled" },
  },
  "non-admin": { id: "00000000-0000-4000-8000-000000000005", row: null },
  pending: {
    id: "00000000-0000-4000-8000-000000000006",
    row: { role: "admin", status: "pending" },
  },
};

/**
 * The page area(s) each API prefix serves. A route may be stricter than its area (for
 * example publish actions that only admins may take), never broader. Longest prefix wins.
 */
const ROUTE_AREAS: [prefix: string, areas: AdminAccessArea[]][] = [
  ["me.ts", ["taskOverview"]],
  ["task-overview.ts", ["taskOverview"]],
  ["access/", ["accessManagement"]],
  ["about-pages.ts", ["contentManagement"]],
  ["adoption-guide-releases", ["contentManagement"]],
  ["adoption-information.ts", ["contentManagement"]],
  ["adoption-instructions", ["contentManagement"]],
  ["annual-reports", ["contentManagement"]],
  ["content", ["contentManagement"]],
  ["documents", ["contentManagement"]],
  ["knowledge.ts", ["contentManagement"]],
  ["media-repairs.ts", ["contentManagement"]],
  ["faq", ["faqManagement"]],
  ["governance.ts", ["governanceManagement"]],
  ["internships.ts", ["internshipManagement"]],
  ["animals/", ["animals"]],
  [
    "adoptions/",
    [
      "adoptionCases",
      "manualIntake",
      "coordinatorTasks",
      "adopters",
      "coordinatorReports",
      "coordinatorStatuses",
      "animals",
    ],
  ],
  ["donations/", ["payments"]],
  ["exports/", ["payments"]],
  ["finance/", ["payments"]],
  ["payment-methods", ["payments"]],
  ["payments", ["payments"]],
  ["receipts", ["payments"]],
  ["supporters", ["supporters"]],
  ["sponsorships/", ["sponsorshipRead", "sponsorshipFinance", "sponsorshipReview"]],
  ["volunteers/", ["volunteerManagement", "volunteerPolicyManagement"]],
];

/** Volunteer policy endpoints are admin-only, narrower than the volunteers prefix. */
const ADMIN_ONLY_PREFIXES = [
  "access/",
  "governance.ts",
  "volunteers/settings/",
  "volunteers/sources/",
  "volunteers/simulation/",
  "volunteers/daily-settings/",
  "volunteers/assessments/",
];

function areasFor(file: string): AdminAccessArea[] {
  const match = ROUTE_AREAS.filter(([prefix]) => file.startsWith(prefix)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return match?.[1] ?? [];
}

type Handler = (context: {
  request: Request;
  params: Record<string, string>;
  context: Record<string, never>;
}) => Promise<Response> | Response;
type RouteModule = { Route?: { options?: { server?: { handlers?: Record<string, Handler> } } } };

let originalFetch: typeof fetch;
let calledBeforeAuth: string[] = [];
let authChecked = false;
const savedEnv: Record<string, string | undefined> = {};

function fakeSupabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(String(input), init);
  const url = new URL(request.url);
  if (url.pathname === "/auth/v1/user") {
    authChecked = true;
    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    const user = USERS[token];
    if (!user) return Promise.resolve(Response.json({ msg: "invalid JWT" }, { status: 401 }));
    return Promise.resolve(
      Response.json({ id: user.id, email: `${token}@example.test`, aud: "authenticated" }),
    );
  }
  if (url.pathname === "/rest/v1/admin_user") {
    const id = (url.searchParams.get("auth_user_id") ?? "").replace(/^eq\./, "");
    const entry = Object.entries(USERS).find(([, user]) => user.id === id);
    const row = entry?.[1].row;
    return Promise.resolve(
      Response.json(
        row ? [{ id, auth_user_id: id, email: `${entry[0]}@example.test`, ...row }] : [],
      ),
    );
  }
  if (!authChecked) calledBeforeAuth.push(`${request.method} ${url.pathname}`);
  return Promise.resolve(
    Response.json({ message: "fake database unavailable", code: "XX000" }, { status: 500 }),
  );
}

async function call(handler: Handler, method: string, caller: Caller) {
  calledBeforeAuth = [];
  authChecked = false;
  const headers = new Headers({ "content-type": "application/json" });
  if (caller === "invalid") headers.set("authorization", "Bearer not-a-real-token");
  else if (caller !== "anonymous") headers.set("authorization", `Bearer ${caller}`);
  const request = new Request(`http://localhost:3000/api/admin/sweep?id=${RECORD_ID}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : "{}",
  });
  const params = new Proxy<Record<string, string>>({}, { get: () => RECORD_ID });
  let status: number;
  try {
    const response = await Promise.race([
      Promise.resolve(handler({ request, params, context: {} })),
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(new Response(null, { status: 504 })), 5_000),
      ),
    ]);
    status = response.status;
  } catch (error) {
    status = error instanceof Response ? error.status : 500;
  }
  return { status, calledBeforeAuth: [...calledBeforeAuth] };
}

type Endpoint = { file: string; method: string; handler: Handler };
const endpoints: Endpoint[] = [];

beforeAll(async () => {
  for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    savedEnv[key] = process.env[key];
  }
  process.env.SUPABASE_URL = FAKE_SUPABASE;
  process.env.VITE_SUPABASE_URL = FAKE_SUPABASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(fakeSupabaseFetch, { preconnect: originalFetch.preconnect });

  const root = new URL("../../../", import.meta.url).pathname;
  const files = (await Array.fromAsync(new Bun.Glob("src/routes/api/admin/**/*.ts").scan(root)))
    .map((path) => path.split("\\").join("/"))
    .filter((path) => !path.includes(".test.") && !path.split("/").pop()?.startsWith("-"))
    .sort();
  for (const path of files) {
    const mod = (await import(root + path)) as RouteModule;
    const handlers = mod.Route?.options?.server?.handlers ?? {};
    for (const [method, handler] of Object.entries(handlers)) {
      endpoints.push({ file: path.replace("src/routes/api/admin/", ""), method, handler });
    }
  }
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("admin API authorization sweep", () => {
  test("discovers every admin route handler", () => {
    expect(endpoints.length).toBeGreaterThan(200);
    for (const { file } of endpoints) {
      expect(areasFor(file), `${file} has no access area in ROUTE_AREAS`).not.toEqual([]);
    }
  });

  test("anonymous and invalid-token callers get 401 and touch no data (BUG-26)", async () => {
    const failures: string[] = [];
    for (const { file, method, handler } of endpoints) {
      for (const caller of ["anonymous", "invalid"] as const) {
        const result = await call(handler, method, caller);
        if (result.status !== 401 || result.calledBeforeAuth.length > 0) {
          failures.push(
            `${method} ${file} as ${caller}: ${result.status} ${result.calledBeforeAuth}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  test("signed-in users without an active admin row get 403 (BUG-26, BUG-27)", async () => {
    const failures: string[] = [];
    for (const { file, method, handler } of endpoints) {
      for (const caller of ["non-admin", "disabled", "pending"] as const) {
        // `/me` deliberately activates a pending invite; every other route refuses it.
        if (caller === "pending" && file === "me.ts") continue;
        const result = await call(handler, method, caller);
        if (result.status !== 403)
          failures.push(`${method} ${file} as ${caller}: ${result.status}`);
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  test("no route admits a role its page area denies, and admin is never refused (BUG-26)", async () => {
    const failures: string[] = [];
    for (const { file, method, handler } of endpoints) {
      const areas = areasFor(file);
      const adminOnly = ADMIN_ONLY_PREFIXES.some((prefix) => file.startsWith(prefix));
      for (const role of ROLES) {
        const { status } = await call(handler, method, role);
        const allowed = status !== 401 && status !== 403;
        const permitted =
          (!adminOnly || role === "admin") &&
          areas.some((area) => canRoleAccessAdminArea(role, area));
        if (allowed && !permitted) failures.push(`${method} ${file} admits ${role} (${status})`);
        if (role === "admin" && !allowed)
          failures.push(`${method} ${file} refuses admin (${status})`);
      }
    }
    expect(failures).toEqual([]);
  }, 180_000);
});
