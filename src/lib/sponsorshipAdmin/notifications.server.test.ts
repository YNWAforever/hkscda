import { expect, test } from "bun:test";
import { createSponsorshipOutboxWorker, type Delivery } from "./outbox.server";
const job: Delivery = {
  id: "outbox-1",
  lease_token: "lease-1",
  pledge_id: "11111111-2222-4333-8444-555555555555",
  scope: "proof-1:approved",
  event: "active",
  supporterEmail: "synthetic@example.invalid",
  supporterName: "Synthetic",
  language: "en",
  amountCents: 30000,
};
test("provider rejection remains failed and retry uses the same provider key", async () => {
  const keys: string[] = [];
  const finishes: unknown[] = [];
  let attempt = 0;
  const worker = createSponsorshipOutboxWorker({
    claim: async () => [job],
    from: "test@example.invalid",
    provider: {
      send: async (input) => {
        keys.push(input.idempotencyKey);
        return ++attempt === 1
          ? { kind: "rejected", code: "transport_error", retryable: true }
          : { kind: "accepted", providerMessageId: "synthetic-provider-id" };
      },
    },
    finish: async (...args) => {
      finishes.push(args);
      return true;
    },
  });
  expect((await worker())[0].status).toBe("failed");
  expect((await worker())[0].status).toBe("provider_accepted");
  expect(keys).toEqual(["sponsorship-outbox-1", "sponsorship-outbox-1"]);
  expect(finishes[1]).toEqual([job, "synthetic-provider-id", null]);
});
test("lost lease does not report delivery success", async () => {
  const worker = createSponsorshipOutboxWorker({
    claim: async () => [job],
    from: "test@example.invalid",
    provider: { send: async () => ({ kind: "accepted", providerMessageId: "synthetic" }) },
    finish: async () => false,
  });
  expect((await worker())[0].status).toBe("lease_lost");
});
