import { afterAll, expect, mock, test } from "bun:test";

// The real reconcileManualPayment runs against a client whose RPC answers as Postgres does
// when the payment id in the path is not a UUID.
const realSupabase = { ...(await import("../../../../lib/donations/supabase.server")) };
const rpcCalls: string[] = [];
const client = {
  rpc: async (fn: string) => {
    rpcCalls.push(fn);
    return {
      data: null,
      error: {
        code: "22P02",
        message: 'invalid input syntax for type uuid: "abc"',
        details: null,
        hint: null,
      },
    };
  },
};
mock.module("../../../../lib/donations/supabase.server", () => ({
  ...realSupabase,
  createSupabaseServiceClient: () => client,
  requireAdmin: async () => ({ authUserId: "treasurer" }),
}));

const { Route } = await import("./$id/reconcile");

afterAll(() => {
  mock.module("../../../../lib/donations/supabase.server", () => realSupabase);
});

test("BUG-14: reconciling a non-UUID payment id is a 400, not a 500", async () => {
  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Payment reconcile POST handler missing");
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await handler({
      request: new Request("http://localhost/api/admin/payments/abc/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bankReference: "FPS-123" }),
      }),
      params: { id: "abc" },
    } as never);
    if (!(response instanceof Response)) throw new Error("Expected HTTP response");
    expect(response.status).toBe(400);
  } finally {
    console.error = originalError;
  }
});
