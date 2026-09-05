import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  issueManualDonationSideEffects,
  retrySucceededDonationSideEffects,
} from "./reconcile.server";
import { sendDonationAcknowledgement } from "./notifications.server";

export type DeliveryRunResult =
  | { kind: "complete" }
  | { kind: "retryable"; code: string }
  | { kind: "attention_required"; code: string }
  | { kind: "busy" };
export type DeliveryJobStatus =
  | "pending"
  | "processing"
  | "retryable"
  | "attention_required"
  | "complete";
export interface DonationDeliveryWorker {
  run(jobId: string): Promise<DeliveryRunResult>;
}
export interface DeliveryJobRepository {
  status(jobId: string): Promise<DeliveryJobStatus | null>;
  claim(
    jobId: string,
    owner: string,
    leaseUntil: string,
  ): Promise<{ paymentId: string; attempts: number } | null>;
  complete(jobId: string, owner: string): Promise<boolean>;
  fail(
    jobId: string,
    owner: string,
    input: { code: string; retryable: boolean; retryAt: string | null },
  ): Promise<boolean>;
  retry(jobId: string, actorUserId: string): Promise<boolean>;
}
export function createSupabaseDeliveryJobRepository(
  client: SupabaseClient,
  now = () => new Date(),
): DeliveryJobRepository {
  return {
    async status(jobId) {
      const { data, error } = await client
        .from("donation_delivery_job")
        .select("status")
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw error;
      return data ? (data.status as DeliveryJobStatus) : null;
    },
    async claim(jobId, owner, leaseUntil) {
      const { data, error } = await client.rpc("claim_donation_delivery_job", {
        p_job_id: jobId,
        p_owner: owner,
        p_lease_until: leaseUntil,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? { paymentId: row.payment_id as string, attempts: row.attempts as number } : null;
    },
    async complete(jobId, owner) {
      const { data, error } = await client
        .from("donation_delivery_job")
        .update({
          status: "complete",
          lease_until: null,
          lease_owner: null,
          next_attempt_at: null,
          error_code: null,
          updated_at: now().toISOString(),
        })
        .eq("id", jobId)
        .eq("status", "processing")
        .eq("lease_owner", owner)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async fail(jobId, owner, input) {
      const { data, error } = await client
        .from("donation_delivery_job")
        .update({
          status: input.retryable ? "retryable" : "attention_required",
          next_attempt_at: input.retryAt,
          error_code: input.code,
          lease_until: null,
          lease_owner: null,
          updated_at: now().toISOString(),
        })
        .eq("id", jobId)
        .eq("status", "processing")
        .eq("lease_owner", owner)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async retry(jobId, actorUserId) {
      const { data, error } = await client.rpc("retry_donation_delivery_job_with_audit", {
        p_job_id: jobId,
        p_actor_user_id: actorUserId,
      });
      if (error) throw error;
      return data === true;
    },
  };
}
export class DonationDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "DonationDeliveryError";
  }
}
// Retain the established idempotent receipt allocator and provider message key.
// A queued acknowledgement (including missing provider configuration) is not completion.
export function createDonationDeliveryHandler(
  client: SupabaseClient,
  deps: {
    issue?: typeof issueManualDonationSideEffects;
    send?: typeof sendDonationAcknowledgement;
  } = {},
): (paymentId: string) => Promise<void> {
  return async (paymentId) => {
    await (deps.issue ?? retrySucceededDonationSideEffects)(client, paymentId, {
      sendAcknowledgement: async (database, input) => {
        const result = await (deps.send ?? sendDonationAcknowledgement)(database, input);
        if (result === "sent" || result === "skipped") return result;
        if (result === "failed") {
          const { data, error } = await database
            .from("message")
            .select("status,payload")
            .eq("supporter_id", input.supporterId)
            .eq("channel", "email")
            .contains("payload", { kind: "donation_acknowledgement", donationId: input.donationId })
            .maybeSingle();
          if (error) throw error;
          if (data?.status !== "failed")
            throw new DonationDeliveryError("acknowledgement_pending", true);
          const payload = data?.payload as
            | { providerErrorCode?: unknown; retryable?: unknown }
            | undefined;
          const code =
            typeof payload?.providerErrorCode === "string" &&
            /^[a-z0-9_]{1,80}$/.test(payload.providerErrorCode)
              ? payload.providerErrorCode
              : "acknowledgement_failed";
          throw new DonationDeliveryError(code, payload?.retryable !== false);
        }
        throw new DonationDeliveryError("acknowledgement_pending", true);
      },
    });
  };
}
export function createDonationDeliveryWorker(deps: {
  repository: DeliveryJobRepository;
  deliver(paymentId: string): Promise<void>;
  now?: () => Date;
  owner?: () => string;
  classify?: (error: unknown) => { code: string; retryable: boolean };
}): DonationDeliveryWorker {
  const now = deps.now ?? (() => new Date());
  const classify =
    deps.classify ??
    ((error: unknown) =>
      error instanceof DonationDeliveryError
        ? { code: error.code, retryable: error.retryable }
        : error instanceof Error &&
            error.message ===
              "Donation side effects can only be retried after successful reconciliation"
          ? { code: "payment_not_succeeded", retryable: false }
          : { code: "delivery_failed", retryable: true });
  return {
    async run(jobId) {
      const timestamp = now();
      const owner = (deps.owner ?? randomUUID)();
      const claim = await deps.repository.claim(
        jobId,
        owner,
        new Date(timestamp.getTime() + 300000).toISOString(),
      );
      if (!claim) return { kind: "busy" };
      try {
        await deps.deliver(claim.paymentId);
        if (!(await deps.repository.complete(jobId, owner))) return { kind: "busy" };
        return { kind: "complete" };
      } catch (error) {
        const failure = classify(error);
        const retryAt = failure.retryable
          ? new Date(timestamp.getTime() + Math.min(60, 2 ** claim.attempts) * 60000).toISOString()
          : null;
        if (!(await deps.repository.fail(jobId, owner, { ...failure, retryAt })))
          return { kind: "busy" };
        return failure.retryable
          ? { kind: "retryable", code: failure.code }
          : { kind: "attention_required", code: failure.code };
      }
    },
  };
}
