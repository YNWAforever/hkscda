import { expect, mock, test } from "bun:test";
import { createSponsorshipFinanceReadHandler } from "./finance.http.server";

const id = "33333333-3333-4333-8333-333333333333";
const request = new Request(`http://localhost/api/admin/sponsorships/pledges/${id}/finance`);

for (const role of ["staff", "treasurer", "admin"] as const) {
  test(`${role} finance read passes its permission to the existing-payment lookup`, async () => {
    const canFinance = role !== "staff";
    const read = mock(async (_pledge: string, allowed = false) => ({
      sources: [],
      receipts: [],
      refunds: [],
      deliveries: [],
      candidates: allowed
        ? [
            {
              id: "bank-confirmed-payment",
              amount_cents: 30000,
              bank_reference: "BANK-FIXTURE",
              received_at: "2026-10-28T04:00:00Z",
              donation: [{ supporter_id: id }],
            },
          ]
        : [],
    }));
    const handler = createSponsorshipFinanceReadHandler({
      requireReader: async () => ({
        id,
        authUserId: id,
        role,
        status: "active",
        email: "fixture@example.invalid",
      }),
      read,
    });
    const response = await handler({ request, params: { id } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(read).toHaveBeenCalledWith(id, canFinance);
    expect(await response.json()).toMatchObject({
      canRefund: canFinance,
      canCoordinate: role !== "treasurer",
      candidates: canFinance ? [{ id: "bank-confirmed-payment" }] : [],
    });
  });
}

for (const status of [401, 403]) {
  test(`finance read refusal ${status} never queries payment candidates`, async () => {
    const read = mock(async () => {
      throw Error("must not query");
    });
    const handler = createSponsorshipFinanceReadHandler({
      requireReader: async () => {
        throw new Response("Access denied", { status });
      },
      read,
    });
    expect((await handler({ request, params: { id } })).status).toBe(status);
    expect(read).not.toHaveBeenCalled();
  });
}
