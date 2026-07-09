import type { SupabaseClient } from "@supabase/supabase-js";

import type { PaymentExportRow } from "../crm/csv";
import {
  adminPaymentExportSearchSchema,
  adminPaymentSearchSchema,
  type AdminPaymentListResult,
  type AdminPaymentRow,
  type AdminReceiptRow,
  summarizePayments,
} from "./adminPayments";

const PAYMENT_SELECT =
  "id,provider,provider_ref,amount_cents,status,received_at,bank_reference,created_at,donation_id,donation:donation_id(id,purpose,receipt_requested,status,supporter:supporter_id(id,name,email,phone,language))";

function applyPaymentFilters<
  T extends {
    eq: (column: string, value: unknown) => T;
    in: (column: string, value: string[]) => T;
  },
>(query: T, filters: { status: string; provider: string }, paymentIds?: string[]) {
  let next = query;
  if (filters.status !== "all") next = next.eq("status", filters.status);
  if (filters.provider !== "all") next = next.eq("provider", filters.provider);
  if (paymentIds) next = next.in("id", paymentIds);
  return next;
}

async function selectPaymentRows(
  client: SupabaseClient,
  filters: { status: string; provider: string },
  options: { from?: number; to?: number; paymentIds?: string[] } = {},
) {
  if (options.paymentIds && options.paymentIds.length === 0) {
    return { rows: [] as AdminPaymentRow[], count: 0 };
  }

  let query = client
    .from("payment")
    .select(PAYMENT_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });
  query = applyPaymentFilters(query, filters, options.paymentIds);
  if (options.from !== undefined && options.to !== undefined) query = query.range(options.from, options.to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as AdminPaymentRow[], count: count ?? 0 };
}

async function listReceiptsForDonationIds(client: SupabaseClient, donationIds: string[]) {
  if (donationIds.length === 0) return [] as AdminReceiptRow[];

  const { data, error } = await client
    .from("receipt")
    .select("id,receipt_no,donation_ids,status")
    .overlaps("donation_ids", donationIds);

  if (error) throw error;
  return (data ?? []) as unknown as AdminReceiptRow[];
}

function donationIdsFor(payments: AdminPaymentRow[]) {
  return [...new Set(payments.map((payment) => payment.donation.id))];
}

function matchesSearch(text: string | null | undefined, search: string) {
  return (text ?? "").toLowerCase().includes(search.toLowerCase());
}

async function resolveSearchPaymentIds(client: SupabaseClient, q?: string) {
  const trimmed = q?.trim();
  if (!trimmed) return undefined;

  const escaped = trimmed.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
  const pattern = `%${escaped}%`;

  const [{ data: paymentRows, error: paymentError }, { data: supporterRows, error: supporterError }] =
    await Promise.all([
      client.from("payment").select("id,provider_ref,bank_reference").or(`provider_ref.ilike.${pattern},bank_reference.ilike.${pattern}`),
      client.from("supporter").select("id,name,email").or(`name.ilike.${pattern},email.ilike.${pattern}`),
    ]);

  if (paymentError) throw paymentError;
  if (supporterError) throw supporterError;

  const ids = new Set<string>();
  for (const row of paymentRows ?? []) {
    if (matchesSearch((row as { provider_ref?: string | null }).provider_ref, trimmed)) {
      ids.add(String((row as { id?: string }).id));
      continue;
    }
    if (matchesSearch((row as { bank_reference?: string | null }).bank_reference, trimmed)) {
      ids.add(String((row as { id?: string }).id));
    }
  }

  const supporterIds = (supporterRows ?? [])
    .filter((row) => matchesSearch((row as { name?: string | null }).name, trimmed) || matchesSearch((row as { email?: string | null }).email, trimmed))
    .map((row) => String((row as { id?: string }).id));

  if (supporterIds.length === 0) return [...ids];

  const { data: donationRows, error: donationError } = await client
    .from("donation")
    .select("id")
    .in("supporter_id", supporterIds);
  if (donationError) throw donationError;

  const donationIds = (donationRows ?? []).map((row) => String((row as { id?: string }).id));
  if (donationIds.length === 0) return [...ids];

  const { data: linkedPayments, error: linkedPaymentError } = await client
    .from("payment")
    .select("id,donation_id")
    .in("donation_id", donationIds);
  if (linkedPaymentError) throw linkedPaymentError;

  for (const row of linkedPayments ?? []) ids.add(String((row as { id?: string }).id));
  return [...ids];
}

export async function listAdminPaymentPage(
  client: SupabaseClient,
  rawSearch: Record<string, string>,
): Promise<AdminPaymentListResult> {
  const filters = adminPaymentSearchSchema.parse(rawSearch);
  const paymentIds = await resolveSearchPaymentIds(client, filters.q);
  const from = (filters.page - 1) * filters.pageSize;

  const pageResult = await selectPaymentRows(client, filters, {
    from,
    to: from + filters.pageSize - 1,
    paymentIds,
  });
  const summaryResult = await selectPaymentRows(client, filters, { paymentIds });
  const summaryReceipts = await listReceiptsForDonationIds(client, donationIdsFor(summaryResult.rows));
  const pageDonationIds = new Set(donationIdsFor(pageResult.rows));
  const pageReceipts = summaryReceipts.filter((receipt) =>
    receipt.donation_ids.some((donationId) => pageDonationIds.has(donationId)),
  );

  return {
    payments: pageResult.rows,
    receipts: pageReceipts,
    total: pageResult.count,
    page: filters.page,
    pageSize: filters.pageSize,
    summary: summarizePayments(summaryResult.rows, summaryReceipts),
  };
}

export async function listAdminPaymentExportRows(
  client: SupabaseClient,
  rawSearch: Record<string, string>,
): Promise<PaymentExportRow[]> {
  const filters = adminPaymentExportSearchSchema.parse(rawSearch);
  const paymentIds = await resolveSearchPaymentIds(client, filters.q);
  const result = await selectPaymentRows(client, filters, { paymentIds });

  return result.rows.map((payment) => ({
    paymentId: payment.id,
    supporterName: payment.donation.supporter.name,
    supporterEmail: payment.donation.supporter.email,
    provider: payment.provider,
    amountCents: payment.amount_cents,
    purpose: payment.donation.purpose,
    status: payment.status,
    providerRef: payment.provider_ref,
    bankReference: payment.bank_reference,
    receivedAt: payment.received_at,
    createdAt: payment.created_at,
  }));
}
