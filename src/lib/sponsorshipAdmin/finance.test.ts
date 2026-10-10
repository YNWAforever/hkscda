import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSponsorshipFinanceRepository, financeCommandSchema } from "./finance.server";
const id = "33333333-3333-4333-8333-333333333333";
test("finance commands reject forged actor and missing factual refund reference", () => {
  expect(
    financeCommandSchema.safeParse({
      action: "refund",
      proofId: id,
      expectedRevision: 2,
      reference: "BANK-1",
      reason: "Supporter requested",
      actor: id,
    }).success,
  ).toBe(false);
  expect(
    financeCommandSchema.safeParse({
      action: "refund",
      proofId: id,
      expectedRevision: 2,
      reference: "",
      reason: "Supporter requested",
    }).success,
  ).toBe(false);
  expect(
    financeCommandSchema.safeParse({ action: "receipt_requested", proofId: id, requested: false })
      .success,
  ).toBe(false);
  expect(
    financeCommandSchema.safeParse({
      action: "allocate",
      proofId: id,
      periodMonth: "2026-07-02",
      amountCents: 100,
    }).success,
  ).toBe(false);
  expect(
    financeCommandSchema.safeParse({
      action: "reconcile",
      proofId: id,
      paymentId: id,
      reason: "Verified original bank payment",
    }).success,
  ).toBe(true);
});

// required-reason: sponsorship_finance.adjust
test("every finance adjustment rejects a reason under 5 characters, and a valid reason reaches the RPC", async () => {
  const withReason = (reason: string) => [
    { action: "verify_contact", reason },
    { action: "reverse", allocationId: id, reason },
    { action: "reconcile", proofId: id, paymentId: id, reason },
    {
      action: "refund",
      amountCents: 100,
      expectedRefundedCents: 0,
      idempotencyKey: id,
      proofId: id,
      expectedRevision: 1,
      reference: "BANK-1",
      reason,
    },
    {
      action: "allocate",
      expectedNet: 0,
      idempotencyKey: id,
      proofId: id,
      periodMonth: "2026-07-01",
      amountCents: 100,
      reason,
    },
  ];
  for (const reason of ["", "    ", "abcd", "  abcd  "]) {
    for (const command of withReason(reason)) {
      expect(financeCommandSchema.safeParse(command).success).toBe(false);
    }
  }

  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const found = { data: { id }, error: null };
  const lookup = { eq: () => lookup, maybeSingle: async () => found };
  const client = {
    from: () => ({ select: () => lookup }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
  const repository = createSponsorshipFinanceRepository(client);
  for (const command of withReason("  Verified by phone  ")) {
    await repository.command("actor-1", id, financeCommandSchema.parse(command));
  }
  expect(rpcCalls).toHaveLength(5);
  expect(rpcCalls.map(({ args }) => args.p_reason ?? args.p_note)).toEqual(
    Array(5).fill("Verified by phone"),
  );
});
