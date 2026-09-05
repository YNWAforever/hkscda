import type { SupabaseClient } from "@supabase/supabase-js";

import { issueManualDonationSideEffects } from "../donations/reconcile.server";
import { loadSupporterAdoptionContext } from "./adoptionContext.server";
import { loadSupporterVolunteerContext } from "../volunteers/repository.server";

import { createCrmReadModel } from "./readModel.server";
import { assembleSupporterTimeline } from "./timeline";
import type { CrmRepository, SupporterUpdatePayload } from "./service";
import type {
  AuditHistoryRow,
  ConsentHistoryRow,
  DonationHistoryRow,
  MessageHistoryRow,
  PaymentHistoryRow,
  ReceiptHistoryRow,
  SupporterDetail,
  SupporterSummary,
} from "./types";

type SupporterRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  language: "zh-HK" | "en";
  tags: string[];
  source: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type ConsentRow = {
  id: string;
  supporter_id: string;
  channel: "email" | "whatsapp";
  status: "opt_in" | "opt_out";
  source: string;
  timestamp: string;
};

type DonationRow = {
  donation_delivery_job?: {
    id: string;
    status: NonNullable<DonationHistoryRow["deliveryJob"]>["status"];
  } | null;
  id: string;
  supporter_id: string;
  amount_cents: number;
  currency: "HKD";
  purpose: "general" | "medical" | "sponsor";
  custom_purpose: string | null;
  status: "pending" | "succeeded" | "failed" | "refunded";
  method: "stripe" | "paypal" | "fps" | "payme" | "manual";
  receipt_requested: boolean;
  created_at: string;
};

type PaymentRow = {
  id: string;
  donation_id: string;
  provider: "stripe" | "paypal" | "fps" | "payme" | "manual";
  provider_ref: string | null;
  amount_cents: number;
  status: "pending" | "succeeded" | "failed" | "refunded";
  received_at: string | null;
  bank_reference: string | null;
  created_at: string;
};

type ReceiptRow = {
  id: string;
  supporter_id: string;
  receipt_no: string;
  donation_ids: string[];
  total_amount_cents: number;
  issued_at: string;
  status: "issued" | "void";
  pdf_url: string | null;
};

type MessageRow = {
  id: string;
  supporter_id: string;
  channel: "email" | "whatsapp";
  status: "queued" | "sent" | "delivered" | "failed";
  payload: Record<string, unknown>;
  sent_at: string | null;
  created_at: string;
};

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  timestamp: string;
  detail: Record<string, unknown>;
};

function mapConsent(row: ConsentRow): ConsentHistoryRow {
  return {
    id: row.id,
    supporterId: row.supporter_id,
    channel: row.channel,
    status: row.status,
    source: row.source,
    timestamp: row.timestamp,
  };
}

function mapDonation(row: DonationRow): DonationHistoryRow {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    currency: row.currency,
    purpose: row.purpose,
    customPurpose: row.custom_purpose,
    deliveryJob: row.donation_delivery_job ?? null,
    status: row.status,
    method: row.method,
    receiptRequested: row.receipt_requested,
    createdAt: row.created_at,
  };
}

function mapPayment(row: PaymentRow): PaymentHistoryRow {
  return {
    id: row.id,
    donationId: row.donation_id,
    provider: row.provider,
    providerRef: row.provider_ref,
    amountCents: row.amount_cents,
    status: row.status,
    receivedAt: row.received_at,
    bankReference: row.bank_reference,
    createdAt: row.created_at,
  };
}

function mapReceipt(row: ReceiptRow): ReceiptHistoryRow {
  return {
    id: row.id,
    receiptNo: row.receipt_no,
    donationIds: row.donation_ids,
    totalAmountCents: row.total_amount_cents,
    issuedAt: row.issued_at,
    status: row.status,
    pdfUrl: row.pdf_url,
  };
}

function mapMessage(row: MessageRow): MessageHistoryRow {
  return {
    id: row.id,
    channel: row.channel,
    status: row.status,
    payload: row.payload,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

function mapAudit(row: AuditRow): AuditHistoryRow {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    timestamp: row.timestamp,
    detail: row.detail,
  };
}

function toSupporterUpdatePayload(update: SupporterUpdatePayload) {
  const payload: Record<string, string | string[] | null> = {};
  if (update.name !== undefined) payload.name = update.name;
  if (update.phone !== undefined) payload.phone = update.phone;
  if (update.language !== undefined) payload.language = update.language;
  if (update.tags !== undefined) payload.tags = update.tags;
  if (update.deletedAt !== undefined) payload.deleted_at = update.deletedAt;
  return payload;
}

export function createSupabaseCrmRepository(client: SupabaseClient): CrmRepository {
  const readModel = createCrmReadModel(client);
  return {
    listSupporters: readModel.list,

    async getSupporterDetail(id) {
      const { data: supporterRow, error: supporterError } = await client
        .from("supporter")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (supporterError) throw supporterError;
      if (!supporterRow) return null;

      const summary = await readModel.summary(id);
      if (!summary) return null;
      const [donationResult, pledgeResult] = await Promise.all([
        client
          .from("donation")
          .select("*,donation_delivery_job(id,status)")
          .eq("supporter_id", id)
          .order("created_at", { ascending: false }),
        client.from("sponsorship_pledge").select("id").eq("supporter_id", id),
      ]);
      if (donationResult.error) throw donationResult.error;
      if (pledgeResult.error) throw pledgeResult.error;
      const donationRows = (donationResult.data ?? []) as DonationRow[];
      const donationIds = donationRows.map((row) => row.id);
      const pledgeIds = ((pledgeResult.data ?? []) as Array<{ id: string }>).map((row) => row.id);

      const [paymentsResult, receiptsResult, consentsResult, messagesResult, auditResult] =
        await Promise.all([
          donationIds.length
            ? client
                .from("payment")
                .select(
                  "id,donation_id,provider,provider_ref,amount_cents,status,received_at,bank_reference,created_at",
                )
                .in("donation_id", donationIds)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          client
            .from("receipt")
            .select("*")
            .eq("supporter_id", id)
            .order("issued_at", { ascending: false }),
          client
            .from("consent")
            .select("id,supporter_id,channel,status,source,timestamp")
            .eq("supporter_id", id)
            .order("timestamp", { ascending: false }),
          client
            .from("message")
            .select("id,supporter_id,channel,status,payload,sent_at,created_at")
            .eq("supporter_id", id)
            .order("created_at", { ascending: false }),
          client
            .from("audit_log")
            .select("id,actor_user_id,action,entity,entity_id,timestamp,detail")
            .in("entity_id", [id, ...donationIds, ...pledgeIds])
            .order("timestamp", { ascending: false }),
        ]);

      if (paymentsResult.error) throw paymentsResult.error;
      if (receiptsResult.error) throw receiptsResult.error;
      if (consentsResult.error) throw consentsResult.error;
      if (messagesResult.error) throw messagesResult.error;
      if (auditResult.error) throw auditResult.error;

      const donations = donationRows.map(mapDonation);
      const payments = ((paymentsResult.data ?? []) as PaymentRow[]).map(mapPayment);
      const receipts = ((receiptsResult.data ?? []) as ReceiptRow[]).map(mapReceipt);
      const consents = ((consentsResult.data ?? []) as ConsentRow[]).map(mapConsent);
      const messages = ((messagesResult.data ?? []) as MessageRow[]).map(mapMessage);
      const auditLogs = ((auditResult.data ?? []) as AuditRow[]).map(mapAudit);
      const adoption = await loadSupporterAdoptionContext(client, id);
      const volunteer = await loadSupporterVolunteerContext(client, id);

      return {
        ...summary,
        source: (supporterRow as SupporterRow).source,
        createdAt: (supporterRow as SupporterRow).created_at,
        updatedAt: (supporterRow as SupporterRow).updated_at,
        donations,
        payments,
        receipts,
        consents,
        messages,
        auditLogs,
        adoption,
        volunteer,
        timeline: assembleSupporterTimeline({
          donations,
          payments,
          receipts,
          consents,
          messages,
          auditLogs,
          adoption,
          volunteer,
        }),
      } satisfies SupporterDetail;
    },

    async upsertSupporter(input) {
      const { data, error } = await client
        .from("supporter")
        .upsert(
          {
            name: input.name,
            email: input.email,
            phone: input.phone ?? null,
            language: input.language,
            tags: input.tags,
            source: input.source,
            deleted_at: null,
          },
          { onConflict: "email" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return { id: data.id as string, email: data.email as string };
    },

    async updateSupporter(id, input) {
      const payload = toSupporterUpdatePayload(input);
      const { error } = await client
        .from("supporter")
        .update(payload)
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
    },

    async ensureSupporterRole(input) {
      const { error } = await client.from("supporter_role").upsert({
        supporter_id: input.supporterId,
        role: input.role,
      });
      if (error) throw error;
    },

    async setSupporterRoles(input) {
      const { error: deleteError } = await client
        .from("supporter_role")
        .delete()
        .eq("supporter_id", input.supporterId);
      if (deleteError) throw deleteError;

      const { error } = await client.from("supporter_role").insert(
        input.roles.map((role) => ({
          supporter_id: input.supporterId,
          role,
        })),
      );
      if (error) throw error;
    },

    async insertConsentRows(rows) {
      if (rows.length === 0) return;
      // Replays/double-clicks must not append duplicate rows to the legal
      // consent ledger. consent_dedup_unique backs this; ignore exact dupes.
      const { error } = await client.from("consent").upsert(rows, {
        onConflict: "supporter_id,channel,status,source,timestamp",
        ignoreDuplicates: true,
      });
      if (error) throw error;
    },

    async recordManualGift(command) {
      const { data, error } = await client.rpc("record_manual_gift_with_audit", {
        p_request_id: command.requestId,
        p_actor_user_id: command.actorUserId,
        p_input: command.input,
      });
      if (error) {
        if ((error as { message?: string }).message?.includes("manual_gift_payload_conflict")) {
          throw Response.json({ error: "requestId payload conflict" }, { status: 409 });
        }
        throw error;
      }
      return data as {
        donationId: string;
        paymentId: string;
        deliveryJobId: string | null;
        replayed: boolean;
      };
    },
    async completeManualDonationSideEffects(paymentId) {
      await issueManualDonationSideEffects(client, paymentId);
    },

    async insertManualDonation(records) {
      const { data: donation, error: donationError } = await client
        .from("donation")
        .insert(records.donation)
        .select("id")
        .single();
      if (donationError) throw donationError;

      const { data: payment, error: paymentError } = await client
        .from("payment")
        .insert(records.payment)
        .select("id")
        .single();
      if (paymentError) throw paymentError;

      const { error: auditError } = await client.from("audit_log").insert(records.audit);
      if (auditError) throw auditError;

      return { donationId: donation.id as string, paymentId: payment.id as string };
    },

    listSupportersForExport: readModel.exportSupporters,
    listDonationsForExport: readModel.exportDonations,

    async insertAuditLog(row) {
      const { error } = await client.from("audit_log").insert({
        actor_user_id: row.actor_user_id,
        action: row.action,
        entity: row.entity,
        entity_id: row.entity_id,
        timestamp: row.timestamp,
        detail: row.detail,
      });
      if (error) throw error;
    },
  };
}
