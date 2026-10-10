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

async function post(body: string | undefined) {
  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Receipt void POST handler missing");
  const response = await handler({
    request: new Request(
      "http://localhost/api/admin/receipts/11111111-1111-4111-8111-111111111111/void",
      { method: "POST", body },
    ),
    params: { id: "11111111-1111-4111-8111-111111111111" },
  } as never);
  if (!(response instanceof Response)) throw new Error("Expected HTTP response");
  return response;
}

// required-reason: receipt.void
test("a receipt void passes the trimmed reason to the void", async () => {
  voidReceipt.mockClear();
  const response = await post(JSON.stringify({ reason: "  duplicate  " }));
  expect(response.status).toBe(200);
  expect(voidReceipt).toHaveBeenCalledTimes(1);
  const call = voidReceipt.mock.calls[0] as unknown as [
    unknown,
    string,
    string,
    { reason: string },
  ];
  expect(call[3].reason).toBe("duplicate");
});

for (const [label, body] of [
  ["no body", undefined],
  ["an empty object", JSON.stringify({})],
  ["a blank reason", JSON.stringify({ reason: "   " })],
  ["a reason over 500 characters", JSON.stringify({ reason: "x".repeat(501) })],
] as const) {
  test(`a receipt void with ${label} is a 400 and never voids`, async () => {
    voidReceipt.mockClear();
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(voidReceipt).not.toHaveBeenCalled();
  });
}
