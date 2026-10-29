import { afterAll, expect, mock, test } from "bun:test";

// The real voidReceipt runs against a client whose RPC answers as Postgres does when a second
// tab voids a receipt that is already void.
const realSupabase = { ...(await import("../../../../lib/donations/supabase.server")) };
const client = {
  rpc: async () => ({
    data: null,
    error: { code: "22023", message: "receipt_not_issued", details: null, hint: null },
  }),
};
mock.module("../../../../lib/donations/supabase.server", () => ({
  ...realSupabase,
  createSupabaseServiceClient: () => client,
  requireAdmin: async () => ({ authUserId: "treasurer" }),
}));

const { Route } = await import("./$id/void");

afterAll(() => {
  mock.module("../../../../lib/donations/supabase.server", () => realSupabase);
});

test("BUG-14: voiding an already-void receipt is a 409 conflict, not a 500", async () => {
  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Receipt void POST handler missing");
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await handler({
      request: new Request(
        "http://localhost/api/admin/receipts/11111111-1111-4111-8111-111111111111/void",
        { method: "POST", body: JSON.stringify({ reason: "duplicate" }) },
      ),
      params: { id: "11111111-1111-4111-8111-111111111111" },
    } as never);
    if (!(response instanceof Response)) throw new Error("Expected HTTP response");
    expect(response.status).toBe(409);
  } finally {
    console.error = originalError;
  }
});
