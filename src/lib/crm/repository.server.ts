import type { SupabaseClient } from "@supabase/supabase-js";

import type { DonationExportRow } from "./csv";
import { latestConsentByChannel } from "./consent";
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
  SupporterRole,
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

type RoleRow = {
  supporter_id: string;
  role: SupporterRole;
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
  id: string;
  supporter_id: string;
  amount_cents: number;
  currency: "HKD";
  purpose: "general" | "medical" | "sponsor";
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

type SearchFilters = Parameters<CrmRepository["listSupporters"]>[0];
type ExportFilters = Parameters<CrmRepository["listSupportersForExport"]>[0];

const exportLimit = 5000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const donationPurposes = new Set(["general", "medical", "sponsor"]);

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function intersect(left: string[] | undefined, right: string[]) {
  if (left === undefined) return unique(right);
  const next = new Set(right);
  return left.filter((id) => next.has(id));
}

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

async function resolveSupporterIds(client: SupabaseClient, filters: SearchFilters | ExportFilters) {
  let ids: string[] | undefined;

  if (filters.q) {
    const q = filters.q.trim();
    const like = `%${escapeLike(q)}%`;
    const qIds: string[] = [];

    const { data: supporterMatches, error: supporterError } = await client
      .from("supporter")
      .select("id")
      .or(`email.eq.${q.toLowerCase()},name.ilike.${like},phone.ilike.${like}`);
    if (supporterError) throw supporterError;
    qIds.push(...((supporterMatches ?? []) as Array<{ id: string }>).map((row) => row.id));

    if (uuidPattern.test(q)) {
      const { data: donationMatches, error: donationError } = await client
        .from("donation")
        .select("supporter_id")
        .eq("id", q);
      if (donationError) throw donationError;
      qIds.push(
        ...((donationMatches ?? []) as Array<{ supporter_id: string }>).map(
          (row) => row.supporter_id,
        ),
      );
    }

    if (donationPurposes.has(q)) {
      const { data: purposeMatches, error: purposeError } = await client
        .from("donation")
        .select("supporter_id")
        .eq("purpose", q);
      if (purposeError) throw purposeError;
      qIds.push(
        ...((purposeMatches ?? []) as Array<{ supporter_id: string }>).map(
          (row) => row.supporter_id,
        ),
      );
    }

    const { data: paymentMatches, error: paymentError } = await client
      .from("payment")
      .select("donation_id")
      .or(`provider_ref.ilike.${like},bank_reference.ilike.${like}`);
    if (paymentError) throw paymentError;
    const paymentDonationIds = unique(
      ((paymentMatches ?? []) as Array<{ donation_id: string }>).map((row) => row.donation_id),
    );
    if (paymentDonationIds.length > 0) {
      const { data: paymentDonations, error: paymentDonationError } = await client
        .from("donation")
        .select("supporter_id")
        .in("id", paymentDonationIds);
      if (paymentDonationError) throw paymentDonationError;
      qIds.push(
        ...((paymentDonations ?? []) as Array<{ supporter_id: string }>).map(
          (row) => row.supporter_id,
        ),
      );
    }

    const { data: receiptMatches, error: receiptError } = await client
      .from("receipt")
      .select("supporter_id")
      .ilike("receipt_no", like);
    if (receiptError) throw receiptError;
    qIds.push(
      ...((receiptMatches ?? []) as Array<{ supporter_id: string }>).map((row) => row.supporter_id),
    );

    ids = intersect(ids, qIds);
  }

  if (filters.role) {
    const { data, error } = await client
      .from("supporter_role")
      .select("supporter_id")
      .eq("role", filters.role);
    if (error) throw error;
    ids = intersect(
      ids,
      ((data ?? []) as Array<{ supporter_id: string }>).map((row) => row.supporter_id),
    );
  }

  if (filters.consentChannel || filters.consentStatus) {
    let query = client.from("consent").select("supporter_id");
    if (filters.consentChannel) query = query.eq("channel", filters.consentChannel);
    if (filters.consentStatus) query = query.eq("status", filters.consentStatus);
    const { data, error } = await query;
    if (error) throw error;
    ids = intersect(
      ids,
      ((data ?? []) as Array<{ supporter_id: string }>).map((row) => row.supporter_id),
    );
  }

  if (filters.purpose || filters.receiptNeeded !== undefined) {
    let query = client.from("donation").select("supporter_id");
    if (filters.purpose) query = query.eq("purpose", filters.purpose);
    if (filters.receiptNeeded !== undefined) {
      query = query.eq("receipt_requested", filters.receiptNeeded);
    }
    const { data, error } = await query;
    if (error) throw error;
    ids = intersect(
      ids,
      ((data ?? []) as Array<{ supporter_id: string }>).map((row) => row.supporter_id),
    );
  }

  return ids;
}

async function hydrateSupporters(client: SupabaseClient, rows: SupporterRow[]) {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];

  const [rolesResult, donationResult, consentResult] = await Promise.all([
    client.from("supporter_role").select("supporter_id,role").in("supporter_id", ids),
    client
      .from("donation")
      .select("id,supporter_id,amount_cents,status,receipt_requested,created_at")
      .in("supporter_id", ids),
    client
      .from("consent")
      .select("id,supporter_id,channel,status,source,timestamp")
      .in("supporter_id", ids)
      .order("timestamp", { ascending: false }),
  ]);

  if (rolesResult.error) throw rolesResult.error;
  if (donationResult.error) throw donationResult.error;
  if (consentResult.error) throw consentResult.error;

  const rolesBySupporter = new Map<string, SupporterRole[]>();
  for (const row of (rolesResult.data ?? []) as RoleRow[]) {
    rolesBySupporter.set(row.supporter_id, [
      ...(rolesBySupporter.get(row.supporter_id) ?? []),
      row.role,
    ]);
  }

  const donationsBySupporter = new Map<string, DonationRow[]>();
  for (const row of (donationResult.data ?? []) as DonationRow[]) {
    donationsBySupporter.set(row.supporter_id, [
      ...(donationsBySupporter.get(row.supporter_id) ?? []),
      row,
    ]);
  }

  const consentsBySupporter = new Map<string, ConsentHistoryRow[]>();
  for (const row of (consentResult.data ?? []) as ConsentRow[]) {
    consentsBySupporter.set(row.supporter_id, [
      ...(consentsBySupporter.get(row.supporter_id) ?? []),
      mapConsent(row),
    ]);
  }

  return rows.map((row): SupporterSummary => {
    const donations = donationsBySupporter.get(row.id) ?? [];
    const succeeded = donations
      .filter((donation) => donation.status === "succeeded")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = latestConsentByChannel(consentsBySupporter.get(row.id) ?? []);

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      language: row.language,
      tags: row.tags,
      roles: rolesBySupporter.get(row.id) ?? [],
      deletedAt: row.deleted_at,
      lastGiftAt: succeeded[0]?.created_at ?? null,
      lastGiftAmountCents: succeeded[0]?.amount_cents ?? null,
      lifetimeAmountCents: succeeded.reduce((total, donation) => total + donation.amount_cents, 0),
      donationCount: donations.length,
      receiptNeeded: donations.some((donation) => donation.receipt_requested),
      emailConsent: latest.email?.status ?? null,
      whatsappConsent: latest.whatsapp?.status ?? null,
    };
  });
}

async function fetchSupporterSummaries(
  client: SupabaseClient,
  filters: SearchFilters | ExportFilters,
  range: { from: number; to: number },
) {
  const ids = await resolveSupporterIds(client, filters);
  if (ids?.length === 0) return { supporters: [], total: 0 };

  let query = client
    .from("supporter")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(range.from, range.to);

  if (!filters.includeDeleted) query = query.is("deleted_at", null);
  if (filters.tag) query = query.contains("tags", [filters.tag]);
  if (ids) query = query.in("id", ids);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    supporters: await hydrateSupporters(client, (data ?? []) as SupporterRow[]),
    total: count ?? 0,
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

async function getRowsByIds<T extends { id: string }>(
  client: SupabaseClient,
  table: "supporter",
  ids: string[],
) {
  if (ids.length === 0) return [];
  const { data, error } = await client.from(table).select("*").in("id", ids);
  if (error) throw error;
  return (data ?? []) as T[];
}

export function createSupabaseCrmRepository(client: SupabaseClient): CrmRepository {
  return {
    async listSupporters(input) {
      const from = (input.page - 1) * input.pageSize;
      return fetchSupporterSummaries(client, input, { from, to: from + input.pageSize - 1 });
    },

    async getSupporterDetail(id) {
      const { data: supporterRow, error: supporterError } = await client
        .from("supporter")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (supporterError) throw supporterError;
      if (!supporterRow) return null;

      const summary = (await hydrateSupporters(client, [supporterRow as SupporterRow]))[0];
      const { data: donationData, error: donationError } = await client
        .from("donation")
        .select("*")
        .eq("supporter_id", id)
        .order("created_at", { ascending: false });
      if (donationError) throw donationError;
      const donationRows = (donationData ?? []) as DonationRow[];
      const donationIds = donationRows.map((row) => row.id);

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
            .in("entity_id", [id, ...donationIds])
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
        timeline: assembleSupporterTimeline({
          donations,
          payments,
          receipts,
          consents,
          messages,
          auditLogs,
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
      const { error } = await client.from("supporter").update(payload).eq("id", id);
      if (error) throw error;
    },

    async ensureSupporterRole(input) {
      const { error } = await client.from("supporter_role").upsert({
        supporter_id: input.supporterId,
        role: input.role,
      });
      if (error) throw error;
    },

    async insertConsentRows(rows) {
      if (rows.length === 0) return;
      const { error } = await client.from("consent").insert(rows);
      if (error) throw error;
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

    async listSupportersForExport(input) {
      const result = await fetchSupporterSummaries(client, input, { from: 0, to: exportLimit - 1 });
      return result.supporters;
    },

    async listDonationsForExport(input) {
      const supporterIds = await resolveSupporterIds(client, input);
      if (supporterIds?.length === 0) return [];

      let query = client
        .from("donation")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(exportLimit);
      if (input.purpose) query = query.eq("purpose", input.purpose);
      if (input.receiptNeeded !== undefined)
        query = query.eq("receipt_requested", input.receiptNeeded);
      if (supporterIds) query = query.in("supporter_id", supporterIds);

      const { data, error } = await query;
      if (error) throw error;
      const donationRows = (data ?? []) as DonationRow[];
      const donationSupporterIds = unique(donationRows.map((row) => row.supporter_id));
      const donationIds = donationRows.map((row) => row.id);
      const [supporters, receiptsResult] = await Promise.all([
        getRowsByIds<SupporterRow>(client, "supporter", donationSupporterIds),
        donationSupporterIds.length
          ? client
              .from("receipt")
              .select("receipt_no,donation_ids,status")
              .in("supporter_id", donationSupporterIds)
              .eq("status", "issued")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (receiptsResult.error) throw receiptsResult.error;

      const supporterById = new Map(supporters.map((supporter) => [supporter.id, supporter]));
      const receiptByDonationId = new Map<string, string>();
      for (const receipt of (receiptsResult.data ?? []) as Array<{
        receipt_no: string;
        donation_ids: string[];
      }>) {
        for (const donationId of receipt.donation_ids) {
          if (donationIds.includes(donationId))
            receiptByDonationId.set(donationId, receipt.receipt_no);
        }
      }

      return donationRows.map((row): DonationExportRow => {
        const supporter = supporterById.get(row.supporter_id);
        return {
          supporterId: row.supporter_id,
          supporterName: supporter?.name ?? "",
          supporterEmail: supporter?.email ?? "",
          donationId: row.id,
          amountCents: row.amount_cents,
          purpose: row.purpose,
          status: row.status,
          method: row.method,
          receiptRequested: row.receipt_requested,
          receiptNo: receiptByDonationId.get(row.id) ?? null,
          createdAt: row.created_at,
        };
      });
    },

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
