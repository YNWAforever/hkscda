import { expect, test } from "bun:test";
import { createBookingService, bookingCommandSchema } from "./booking";
const id = "00000000-0000-4000-8000-000000000001";
test("booking command refuses actor, tier and time injection", () => {
  for (const extra of [{ actor: id }, { tier: "senior" }, { now: "2099-01-01" }])
    expect(
      bookingCommandSchema.safeParse({ action: "availability", activity_id: id, ...extra }).success,
    ).toBe(false);
});
test("book requires explicit displayed terms and an idempotency key", () => {
  expect(bookingCommandSchema.safeParse({ action: "book", activity_id: id }).success).toBe(false);
  expect(
    bookingCommandSchema.safeParse({
      action: "book",
      activity_id: id,
      idempotency_key: id,
      accept_terms: false,
      terms_version_id: id,
    }).success,
  ).toBe(false);
});
test("service sends authenticated actor and unchanged retry key to one admission command", async () => {
  const calls: unknown[] = [];
  const service = createBookingService({
    claim: async () => ({ kind: "claimed" }),
    command: async (actor, command) => {
      calls.push({ actor, command });
      return { kind: "booked" };
    },
    sessions: async () => [],
    me: async () => ({ profile: null, registrations: [] }),
    terms: async () => [],
  });
  const command = {
    action: "book",
    activity_id: id,
    idempotency_key: id,
    accept_terms: true,
    terms_version_id: id,
    remarks: "",
  };
  await service.command(id, command);
  expect(calls).toEqual([{ actor: id, command: { ...command, role: "volunteer" } }]);
});
