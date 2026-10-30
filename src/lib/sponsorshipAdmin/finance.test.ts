import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSponsorshipFinanceRepository, financeCommandSchema } from "./finance.server";
import { withErrors } from "./http.server";
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

type Row = Record<string, unknown>;

/**
 * A chainable Supabase fake for the finance read and command paths. Rows come from `tables`;
 * plain `eq`/`in` filters apply to them, filters on embedded columns (`donation.x`) are ignored,
 * and `rpc` answers with `rpcResult`.
 */
function financeClient(
  tables: Record<string, Row[]>,
  rpcResult: { data: unknown; error: unknown } = { data: null, error: null },
) {
  function query(table: string) {
    let rows = [...(tables[table] ?? [])];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        if (!column.includes(".")) rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      overlaps: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () =>
        rows.length === 1
          ? { data: rows[0], error: null }
          : { data: null, error: { code: "PGRST116", message: "JSON object requested" } },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return builder;
  }
  return {
    from: query,
    rpc: async () => rpcResult,
  } as unknown as SupabaseClient;
}

const pledgeId = "11111111-1111-4111-8111-111111111111";
const proofId = "22222222-2222-4222-8222-222222222222";
const linkedPaymentId = "44444444-4444-4444-8444-444444444444";
const freePaymentId = "55555555-5555-4555-8555-555555555555";
const quietLogger = { error: () => {} };

test("BUG-47: reconcile candidates leave out payments already linked to a proof", async () => {
  const client = financeClient({
    sponsorship_pledge: [{ id: pledgeId, supporter_id: "supporter-1" }],
    sponsorship_payment_proof: [{ id: proofId, pledge_id: pledgeId }],
    sponsorship_payment_source: [
      // Linked to a proof on another pledge of the same supporter.
      { proof_id: "other-proof", payment_id: linkedPaymentId, donation_id: "d-1" },
    ],
    sponsorship_refund: [],
    sponsorship_delivery_status: [],
    payment: [
      { id: linkedPaymentId, status: "succeeded", amount_cents: 30000, bank_reference: "A" },
      { id: freePaymentId, status: "succeeded", amount_cents: 30000, bank_reference: "B" },
    ],
    receipt: [],
  });

  const read = await createSponsorshipFinanceRepository(client, quietLogger).read(pledgeId, true);

  expect((read.candidates ?? []).map((c) => (c as { id: string }).id)).toEqual([freePaymentId]);
});

test("BUG-47: finance read for an unknown pledge is 404, not 500", async () => {
  const client = financeClient({ sponsorship_pledge: [], sponsorship_payment_proof: [] });

  const response = await withErrors(() =>
    createSponsorshipFinanceRepository(client, quietLogger)
      .read(pledgeId, true)
      .then((data) => Response.json(data)),
  );

  expect(response.status).toBe(404);
});

async function commandFailingWith(error: { code: string; message: string }) {
  const logged: unknown[] = [];
  const client = financeClient(
    { sponsorship_payment_proof: [{ id: proofId, pledge_id: pledgeId }] },
    {
      data: null,
      error: { ...error, details: null, hint: null },
    },
  );
  const response = await withErrors(async () =>
    Response.json(
      await createSponsorshipFinanceRepository(client, {
        error: (...args: unknown[]) => logged.push(args),
      }).command("actor-1", pledgeId, {
        action: "reconcile",
        proofId,
        paymentId: linkedPaymentId,
        reason: "Verified original bank payment",
      }),
    ),
  );
  const body = (await response.json()) as { error: string | { code: string; message: string } };
  return { response, body, text: JSON.stringify(body), logged };
}

test("BUG-47: reconciling an already-linked payment is a coded 409 without the raw database text", async () => {
  const { response, body, text } = await commandFailingWith({
    code: "23505",
    message:
      'duplicate key value violates unique constraint "sponsorship_payment_source_payment_id_key"',
  });

  expect(response.status).toBe(409);
  expect(body.error).toMatchObject({ code: "payment_already_linked" });
  expect(text).not.toContain("duplicate key");
});

test("BUG-47: a known finance RPC refusal is mapped to its code", async () => {
  const { response, body } = await commandFailingWith({
    code: "P0001",
    message: "Legacy payment does not match approved proof",
  });

  expect(response.status).toBe(409);
  expect(body.error).toMatchObject({ code: "payment_does_not_match" });
});

test("BUG-47: an unknown finance RPC error is a logged 500 with a generic message", async () => {
  const { response, text, logged } = await commandFailingWith({
    code: "XX000",
    message: "private database detail",
  });

  expect(response.status).toBe(500);
  expect(text).not.toContain("private database detail");
  expect(logged).toHaveLength(1);
});

test("BUG-47: a finance role recheck refusal stays 403", async () => {
  const { response } = await commandFailingWith({
    code: "42501",
    message: "Finance role required",
  });

  expect(response.status).toBe(403);
});
