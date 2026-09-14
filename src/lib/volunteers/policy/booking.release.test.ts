import { expect, test } from "bun:test";
import { bookingCommandSchema, memberQuerySchema, sessionQuerySchema } from "./booking";
import { operationCommandSchema } from "./operations";
const id = "00000000-0000-4000-8000-000000000001";
test("member pagination and filters reject actor injection and invalid bounds", () => {
  expect(sessionQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  expect(sessionQuerySchema.safeParse({ date: "2026-02-30" }).success).toBe(false);
  expect(memberQuerySchema.safeParse({ history_page: 0 }).success).toBe(false);
  expect(
    bookingCommandSchema.safeParse({
      action: "cancel",
      activity_id: id,
      idempotency_key: id,
      profile_id: id,
    }).success,
  ).toBe(false);
});
test("reschedule accepts explicit destination policy and terms only on authoritative apply", () => {
  expect(
    operationCommandSchema.parse({
      action: "move_apply",
      preview_id: id,
      idempotency_key: id,
      reason: "Destination accepted",
      accept_terms: true,
      terms_version_id: id,
      destination_policy_version_id: id,
    }),
  ).toMatchObject({ accept_terms: true, terms_version_id: id, destination_policy_version_id: id });
  expect(
    operationCommandSchema.safeParse({
      action: "move_apply",
      preview_id: id,
      idempotency_key: id,
      reason: "Forged acceptance",
      accept_terms: true,
      actor_user_id: id,
    }).success,
  ).toBe(false);
});
