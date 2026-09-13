import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
export const financeCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify_contact"), reason: z.string().trim().min(5) }).strict(),
  z
    .object({
      action: z.literal("receipt_requested"),
      proofId: z.string().uuid(),
      requested: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("refund"),
      amountCents: z.number().int().positive(),
      expectedRefundedCents: z.number().int().min(0),
      idempotencyKey: z.string().uuid(),
      proofId: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      reference: z.string().trim().min(3),
      reason: z.string().trim().min(5),
    })
    .strict(),
  z
    .object({
      action: z.literal("reverse"),
      allocationId: z.string().uuid(),
      reason: z.string().trim().min(5),
    })
    .strict(),
  z
    .object({
      action: z.literal("allocate"),
      expectedNet: z.number().int().min(0),
      idempotencyKey: z.string().uuid(),
      reason: z.string().trim().min(5),
      proofId: z.string().uuid(),
      periodMonth: z.string().regex(/^\d{4}-\d{2}-01$/),
      amountCents: z.number().int().positive(),
    })
    .strict(),
  z.object({ action: z.literal("open_months") }).strict(),
  z
    .object({
      action: z.literal("reconcile"),
      proofId: z.string().uuid(),
      paymentId: z.string().uuid(),
      reason: z.string().trim().min(5),
    })
    .strict(),
]);
export function createSponsorshipFinanceRepository(client: SupabaseClient) {
  return {
    async read(pledgeId: string, canFinance = false) {
      const proof = await client
        .from("sponsorship_payment_proof")
        .select("id")
        .eq("pledge_id", pledgeId);
      if (proof.error) throw proof.error;
      const ids = (proof.data ?? []).map((x) => x.id);
      const [sources, refunds, deliveries] = await Promise.all([
        ids.length
          ? client
              .from("sponsorship_payment_source")
              .select("proof_id,payment_id,donation_id,source")
              .in("proof_id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? client
              .from("sponsorship_refund")
              .select("proof_id,amount_cents,bank_reference,reason,created_at")
              .in("proof_id", ids)
          : Promise.resolve({ data: [], error: null }),
        client
          .from("sponsorship_delivery_outbox")
          .select("id,proof_id,event,status,attempts,last_error,sent_at")
          .eq("pledge_id", pledgeId)
          .order("created_at", { ascending: false }),
      ]);
      for (const result of [sources, refunds, deliveries]) if (result.error) throw result.error;
      const pledge = await client
        .from("sponsorship_pledge")
        .select("supporter_id")
        .eq("id", pledgeId)
        .single();
      if (pledge.error) throw pledge.error;
      const candidates = canFinance
        ? await client
            .from("payment")
            .select("id,amount_cents,bank_reference,received_at,donation!inner(supporter_id)")
            .eq("donation.supporter_id", pledge.data.supporter_id)
            .eq("status", "succeeded")
            .order("created_at", { ascending: false })
            .limit(100)
        : { data: [], error: null };
      if (candidates.error) throw candidates.error;
      const sourceRows = (sources.data ?? []) as Array<{ proof_id: string; donation_id: string }>;
      const receiptRows = sourceRows.length
        ? await client
            .from("receipt")
            .select("receipt_no,status,donation_ids")
            .overlaps(
              "donation_ids",
              sourceRows.map((s) => s.donation_id),
            )
        : { data: [], error: null };
      if (receiptRows.error) throw receiptRows.error;
      const receipts = (receiptRows.data ?? []).flatMap((r) =>
        sourceRows
          .filter((s) => (r.donation_ids as string[]).includes(s.donation_id))
          .map((s) => ({ proof_id: s.proof_id, receipt_no: r.receipt_no, status: r.status })),
      );
      return {
        sources: sources.data,
        receipts,
        refunds: refunds.data,
        deliveries: deliveries.data,
        candidates: candidates.data,
      };
    },
    async command(actor: string, pledgeId: string, input: z.infer<typeof financeCommandSchema>) {
      if ("proofId" in input) {
        const { data, error } = await client
          .from("sponsorship_payment_proof")
          .select("id")
          .eq("id", input.proofId)
          .eq("pledge_id", pledgeId)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw Response.json({ error: "Payment proof not found" }, { status: 404 });
      }
      if (input.action === "reverse") {
        const { data, error } = await client
          .from("sponsorship_payment_allocation")
          .select("id,sponsorship_period!inner(pledge_id)")
          .eq("id", input.allocationId)
          .eq("sponsorship_period.pledge_id", pledgeId)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw Response.json({ error: "Allocation not found" }, { status: 404 });
      }
      let call;
      switch (input.action) {
        case "verify_contact":
          call = client.rpc("verify_sponsorship_contact_submission", {
            p_actor: actor,
            p_pledge: pledgeId,
            p_reason: input.reason,
          });
          break;
        case "receipt_requested":
          call = client.rpc("record_sponsorship_receipt_request", {
            p_actor: actor,
            p_proof: input.proofId,
          });
          break;
        case "refund":
          call = client.rpc("record_sponsorship_refund", {
            p_actor: actor,
            p_proof: input.proofId,
            p_expected_revision: input.expectedRevision,
            p_expected_refunded: input.expectedRefundedCents,
            p_key: input.idempotencyKey,
            p_amount: input.amountCents,
            p_reference: input.reference,
            p_reason: input.reason,
          });
          break;
        case "reverse":
          call = client.rpc("reverse_sponsorship_allocation_with_audit", {
            p_actor_user_id: actor,
            p_allocation_id: input.allocationId,
            p_note: input.reason,
          });
          break;
        case "allocate":
          call = client.rpc("allocate_exact_sponsorship_payment", {
            p_actor: actor,
            p_proof: input.proofId,
            p_expected_net: input.expectedNet,
            p_key: input.idempotencyKey,
            p_month: input.periodMonth,
            p_amount: input.amountCents,
            p_reason: input.reason,
          });
          break;
        case "open_months":
          call = client.rpc("open_sponsorship_followup_months", {
            p_actor: actor,
            p_pledge: pledgeId,
          });
          break;
        case "reconcile":
          call = client.rpc("reconcile_legacy_sponsorship_payment", {
            p_actor: actor,
            p_proof: input.proofId,
            p_payment: input.paymentId,
            p_reason: input.reason,
          });
          break;
      }
      const { data, error } = await call;
      if (error)
        throw Response.json(
          { error: error.message },
          { status: error.code === "42501" ? 403 : 409 },
        );
      return data;
    },
  };
}
