import { afterAll, expect, mock, test } from "bun:test";

type Write = { kind: "insert" | "rpc"; target: string; payload: unknown };

const writes: Write[] = [];

const paymentRow = {
  id: "pay-1",
  provider: "fps",
  provider_ref: "HKSCDA-ABC123",
  amount_cents: 50000,
  refunded_cents: 0,
  status: "succeeded",
  received_at: "2026-10-01T02:00:00.000Z",
  bank_reference: "FPS-1",
  created_at: "2026-10-01T01:00:00.000Z",
  donation_id: "don-1",
  donation: {
    id: "don-1",
    purpose: "general",
    custom_purpose: null,
    receipt_requested: true,
    status: "succeeded",
    supporter: {
      id: "sup-1",
      name: "Ada Wong",
      email: "ada@example.org",
      phone: null,
      language: "en",
    },
  },
};

/** A query builder that answers every read with the rows of its table and records writes. */
function query(table: string) {
  const rows = table === "payment" ? [paymentRow] : [];
  const result = { data: rows, error: null, count: rows.length };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "or", "order", "range", "limit", "overlaps"]) {
    builder[method] = () => builder;
  }
  builder.insert = (payload: unknown) => {
    writes.push({ kind: "insert", target: table, payload });
    return Promise.resolve({ data: null, error: null });
  };
  builder.then = (
    onfulfilled?: (value: typeof result) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onfulfilled, onrejected);
  return builder;
}

const client = {
  from: (table: string) => query(table),
  rpc: async (fn: string, params: unknown) => {
    writes.push({ kind: "rpc", target: fn, payload: params });
    return { data: null, error: null };
  },
};

const realSupabase = { ...(await import("../../../../lib/donations/supabase.server")) };
mock.module("../../../../lib/donations/supabase.server", () => ({
  ...realSupabase,
  createSupabaseServiceClient: () => client,
  requireAdmin: async () => ({
    id: "treasurer-row",
    authUserId: "11111111-2222-4333-8444-555555555555",
    email: "treasurer@example.org",
    role: "treasurer",
    status: "active",
  }),
}));

const { Route } = await import("./payments[.]csv");

afterAll(() => {
  mock.module("../../../../lib/donations/supabase.server", () => realSupabase);
});

async function exportPayments() {
  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.GET : undefined;
  if (!handler) throw new Error("Payments CSV GET handler missing");
  const response = await handler({
    request: new Request("http://localhost/api/admin/exports/payments.csv?status=all"),
    params: {},
  } as never);
  if (!(response instanceof Response)) throw new Error("Expected HTTP response");
  return response;
}

test("BUG-19: the payments CSV export writes an export.payments audit row", async () => {
  writes.length = 0;
  const response = await exportPayments();
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("ada@example.org");
  const audited = writes.some((write) => JSON.stringify(write.payload).includes("export.payments"));
  expect(audited, "no write carries the export.payments audit action").toBe(true);
});

test("BUG-19: the payments CSV export is sent with cache-control no-store", async () => {
  const response = await exportPayments();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
