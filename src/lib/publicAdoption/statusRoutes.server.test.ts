import { afterAll, describe, expect, mock, test } from "bun:test";

const realServer = { ...(await import("../donations/supabase.server")) };
let activeClient: unknown;
mock.module("../donations/supabase.server", () => ({
  ...realServer,
  createSupabaseServiceClient: () => activeClient,
}));
const { Route: adoptionRoute } = await import("../../routes/api/adoption/status/$token");
const { Route: sponsorshipRoute } = await import("../../routes/api/sponsorships/status/$token");
afterAll(() => mock.module("../donations/supabase.server", () => realServer));

function fixture(
  options: {
    expiry?: string;
    revoked?: boolean;
    missingToken?: boolean;
    missingCase?: boolean;
    statusKey?: string;
    closing?: boolean;
    closedAt?: string | null;
    completed?: boolean;
    caseError?: boolean;
  } = {},
) {
  const queries: Array<{ table: string; columns: string; filters: Record<string, unknown> }> = [];
  activeClient = {
    from(table: string) {
      const call = { table, columns: "", filters: {} as Record<string, unknown> };
      queries.push(call);
      const result = () => {
        const rows: Record<string, unknown> = {
          public_status_token: options.missingToken
            ? null
            : {
                id: "token-row",
                entity_id: "application-1",
                expires_at: options.expiry ?? "2099-01-01T00:00:00Z",
                revoked_at: options.revoked ? "2026-01-01T00:00:00Z" : null,
              },
          adoption_applications: {
            id: "application-1",
            created_at: "2026-10-28T00:00:00Z",
            applicant_name: "Synthetic applicant",
            email: null,
            phone: "00000000",
          },
          adoption_application_animal_preference: [],
          adoption_application_visit_preference: null,
          adoption_case: options.missingCase
            ? null
            : {
                id: "case-1",
                status_id: "case-status-1",
                closed_at: options.closedAt ?? null,
              },
          coordinator_status: {
            key: options.statusKey ?? "new",
            is_closing: options.closing ?? false,
          },
          successful_adoption: options.completed ? { id: "success-1" } : null,
          sponsorship_pledge: {
            id: "pledge-1",
            created_at: "2026-10-28T00:00:00Z",
            monthly_tier: "100",
            amount_cents: 10000,
            status: "active",
          },
          sponsorship_preference: [],
          sponsorship_payment_proof: null,
        };
        if (!(table in rows)) throw new Error("Unexpected status query: " + table);
        return {
          data: rows[table],
          error:
            table === "adoption_case" && options.caseError ? new Error("private DB detail") : null,
        };
      };
      const query = {
        select(columns: string) {
          call.columns = columns;
          return query;
        },
        eq(key: string, value: unknown) {
          call.filters[key] = value;
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        update() {
          return query;
        },
        maybeSingle: async () => result(),
        then(resolve: (value: ReturnType<typeof result>) => unknown) {
          return Promise.resolve(result()).then(resolve);
        },
      };
      return query;
    },
  };
  return queries;
}

async function getStatus(kind: "adoption" | "sponsorship") {
  const route = kind === "adoption" ? adoptionRoute : sponsorshipRoute;
  const handlers = route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.GET : undefined;
  if (!handler) throw new Error("Status GET handler missing");
  const response = await handler({ params: { token: "A".repeat(43) } } as never);
  if (!(response instanceof Response)) throw new Error("Expected HTTP response");
  return response;
}

describe("public bearer status boundaries", () => {
  for (const kind of ["adoption", "sponsorship"] as const) {
    test(`${kind} rejects invalid, expired, and revoked links before reading private data`, async () => {
      for (const options of [
        { expiry: "not-a-date" },
        { expiry: "infinity" },
        { expiry: "2000-01-01T00:00:00Z" },
        { revoked: true },
      ]) {
        const queries = fixture(options);
        const response = await getStatus(kind);
        expect(response.status).toBe(410);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(queries.map((q) => q.table)).toEqual(["public_status_token"]);
      }
    });
    test(`${kind} does not expose other records for an unknown token`, async () => {
      const queries = fixture({ missingToken: true });
      expect((await getStatus(kind)).status).toBe(404);
      expect(queries.map((q) => q.table)).toEqual(["public_status_token"]);
    });
  }
});

test("adoption public progress follows staff work and requires a recorded adoption for completion", async () => {
  for (const [options, expected] of [
    [{ missingCase: true }, "received"],
    [{ statusKey: "new" }, "received"],
    [{ statusKey: "screening" }, "in_progress"],
    [{ statusKey: "home_visit" }, "in_progress"],
    [{ statusKey: "custom_internal_label" }, "in_progress"],
    [{ statusKey: "custom_internal_label", closedAt: "2026-10-28T00:00:00Z" }, "closed"],
    [{ statusKey: "approved", closing: true }, "closed"],
    [{ statusKey: "rejected", closing: true }, "closed"],
    [{ statusKey: "approved", closing: true, completed: true }, "completed"],
  ] as const) {
    const queries = fixture(options);
    const response = await getStatus("adoption");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status.progress).toBe(expected);
    expect(Object.keys(body.status).sort()).toEqual([
      "applicantName",
      "contactSummary",
      "expiresAt",
      "progress",
      "rankedAnimals",
      "reference",
      "submittedAt",
      "visitPreference",
    ]);
    expect(queries.find((q) => q.table === "adoption_case")?.filters).toEqual({
      public_application_id: "application-1",
    });
    if (!("missingCase" in options && options.missingCase)) {
      expect(queries.find((q) => q.table === "successful_adoption")?.filters).toEqual({
        adoption_case_id: "case-1",
      });
    }
  }
});

test("an unavailable staff case read does not report a fabricated public status", async () => {
  fixture({ caseError: true });
  const response = await getStatus("adoption");
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Could not load adoption status" });
});
