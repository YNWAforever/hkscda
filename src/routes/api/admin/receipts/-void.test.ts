import { afterAll, expect, mock, test } from "bun:test";

const realSupabase = { ...(await import("../../../../lib/donations/supabase.server")) };
const realReconcile = { ...(await import("../../../../lib/donations/reconcile.server")) };
const voidReceipt = mock(async () => ({ id: "voided" }));
mock.module("../../../../lib/donations/supabase.server", () => ({
  ...realSupabase,
  createSupabaseServiceClient: () => ({}),
  requireAdmin: async () => ({ authUserId: "treasurer" }),
}));
mock.module("../../../../lib/donations/reconcile.server", () => ({
  ...realReconcile,
  voidReceipt,
}));

const { Route } = await import("./$id/void");

afterAll(() => {
  mock.module("../../../../lib/donations/supabase.server", () => realSupabase);
  mock.module("../../../../lib/donations/reconcile.server", () => realReconcile);
});

test("malformed receipt void JSON cannot execute the void", async () => {
  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Receipt void POST handler missing");
  const response = await handler({
    request: new Request(
      "http://localhost/api/admin/receipts/11111111-1111-4111-8111-111111111111/void",
      {
        method: "POST",
        body: "{broken",
      },
    ),
    params: { id: "11111111-1111-4111-8111-111111111111" },
  } as never);
  if (!(response instanceof Response)) throw new Error("Expected HTTP response");
  expect(response.status).toBe(400);
  expect(voidReceipt).not.toHaveBeenCalled();
});
