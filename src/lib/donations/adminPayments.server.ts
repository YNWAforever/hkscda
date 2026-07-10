import type { SupabaseClient } from "@supabase/supabase-js";

import type { PaymentExportRow } from "../crm/csv";
import {
  adminPaymentExportSearchSchema,
  adminPaymentSearchSchema,
  type AdminPaymentListResult,
  type AdminPaymentRow,
  type AdminReceiptRow,
  type SummarizablePaymentRow,
  summarizePayments,
} from "./adminPayments";

const PAYMENT_SELECT =
  "id,provider,provider_ref,amount_cents,status,received_at,bank_reference,created_at,donation_id,donation:donation_id(id,purpose,receipt_requested,status,supporter:supporter_id(id,name,email,phone,language))";
const PAYMENT_SUMMARY_SELECT =
  "id,provider,amount_cents,status,donation:donation_id(id,receipt_requested,status)";
const READ_BATCH_SIZE = 1000;
const FILTER_VALUE_CHUNK_SIZE = 200;

type CountedRangeResult<Row> = {
  data: Row[] | null;
  error: unknown;
  count: number | null;
};

type CountedRangeQuery<Row> = {
  range: (from: number, to: number) => PromiseLike<CountedRangeResult<Row>>;
};

type SummarizablePaymentReadRow = SummarizablePaymentRow & { id: string };

function uniqueChunks(values: string[]) {
  const uniqueValues = [...new Set(values)];
  const chunks: string[][] = [];
  for (let index = 0; index < uniqueValues.length; index += FILTER_VALUE_CHUNK_SIZE) {
    chunks.push(uniqueValues.slice(index, index + FILTER_VALUE_CHUNK_SIZE));
  }
  return chunks;
}

function dedupeRowsById<Row extends { id: string }>(rows: Row[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

async function readCountedRange<Row>(
  buildQuery: () => unknown,
  from = 0,
  to?: number,
): Promise<{ rows: Row[]; count: number }> {
  const rows: Row[] = [];
  let nextFrom = from;
  let total = Number.POSITIVE_INFINITY;

  while (nextFrom < total && (to === undefined || nextFrom <= to)) {
    const requestedTo = Math.min(to ?? Number.POSITIVE_INFINITY, nextFrom + READ_BATCH_SIZE - 1);
    const { data, error, count } = await (buildQuery() as CountedRangeQuery<Row>).range(
      nextFrom,
      requestedTo,
    );
    if (error) throw error;

    const batch = data ?? [];
    total = count ?? nextFrom + batch.length;
    if (batch.length === 0) {
      if (nextFrom < total && (to === undefined || nextFrom <= to)) {
        throw new Error(
          "Counted payment read returned no rows before the reported count was exhausted",
        );
      }
      break;
    }

    rows.push(...batch);
    nextFrom += batch.length;
  }

  return { rows, count: Number.isFinite(total) ? total : rows.length };
}

function comparePaymentRows(left: AdminPaymentRow, right: AdminPaymentRow) {
  return right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id);
}

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function normalizeSearchValue(value: string) {
  // PostgREST .or() uses comma and parentheses for grammar, so keep search terms literal.
  return value
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+([%_])/g, "$1");
}

function searchPatternFor(value: string) {
  const tokens = normalizeSearchValue(value).split(" ").filter(Boolean).map(escapeLike);
  return tokens.length > 0 ? `%${tokens.join("%")}%` : "%";
}

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
  options: { from?: number; to?: number } = {},
) {
  return readCountedRange<AdminPaymentRow>(
    () => {
      let query = client
        .from("payment")
        .select(PAYMENT_SELECT, { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      query = applyPaymentFilters(query, filters);
      return query;
    },
    options.from,
    options.to,
  );
}

async function selectAllPaymentRows(
  client: SupabaseClient,
  filters: { status: string; provider: string },
  paymentIds?: string[],
) {
  if (paymentIds && paymentIds.length === 0) return [] as AdminPaymentRow[];

  const chunks = paymentIds ? uniqueChunks(paymentIds) : [undefined];
  const rows: AdminPaymentRow[] = [];
  for (const paymentIdChunk of chunks) {
    const result = await readCountedRange<AdminPaymentRow>(() => {
      let query = client
        .from("payment")
        .select(PAYMENT_SELECT, { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      query = applyPaymentFilters(query, filters, paymentIdChunk);
      return query;
    });
    rows.push(...result.rows);
  }

  return dedupeRowsById(rows).sort(comparePaymentRows);
}

async function selectPaymentSummaryRows(
  client: SupabaseClient,
  filters: { status: string; provider: string },
) {
  const result = await readCountedRange<SummarizablePaymentReadRow>(() => {
    let query = client
      .from("payment")
      .select(PAYMENT_SUMMARY_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    query = applyPaymentFilters(query, filters);
    return query;
  });

  return dedupeRowsById(result.rows);
}

async function listReceiptsForDonationIds(client: SupabaseClient, donationIds: string[]) {
  if (donationIds.length === 0) return [] as AdminReceiptRow[];

  const receipts: AdminReceiptRow[] = [];
  for (const donationIdChunk of uniqueChunks(donationIds)) {
    const result = await readCountedRange<AdminReceiptRow>(() =>
      client
        .from("receipt")
        .select("id,receipt_no,donation_ids,status", { count: "exact" })
        .overlaps("donation_ids", donationIdChunk)
        .order("id", { ascending: true }),
    );
    receipts.push(...result.rows);
  }

  return dedupeRowsById(receipts);
}

function donationIdsFor(payments: Array<{ donation: { id: string } }>) {
  return [...new Set(payments.map((payment) => payment.donation.id))];
}

function matchesSearch(text: string | null | undefined, search: string) {
  return normalizeSearchValue(text ?? "")
    .toLowerCase()
    .includes(search.toLowerCase());
}

async function resolveSearchPaymentIds(client: SupabaseClient, q?: string) {
  const trimmed = q?.trim();
  if (!trimmed) return undefined;

  const normalizedSearch = normalizeSearchValue(trimmed);
  const pattern = searchPatternFor(trimmed);

  const [paymentResult, supporterResult] = await Promise.all([
    readCountedRange<Record<string, unknown>>(() =>
      client
        .from("payment")
        .select("id,provider_ref,bank_reference", { count: "exact" })
        .or(`provider_ref.ilike.${pattern},bank_reference.ilike.${pattern}`)
        .order("id", { ascending: true }),
    ),
    readCountedRange<Record<string, unknown>>(() =>
      client
        .from("supporter")
        .select("id,name,email", { count: "exact" })
        .or(`name.ilike.${pattern},email.ilike.${pattern}`)
        .order("id", { ascending: true }),
    ),
  ]);
  const paymentRows = dedupeRowsById(
    paymentResult.rows.map((row) => ({ ...row, id: String(row.id) })),
  );
  const supporterRows = dedupeRowsById(
    supporterResult.rows.map((row) => ({ ...row, id: String(row.id) })),
  );

  const ids = new Set<string>();
  for (const row of paymentRows ?? []) {
    if (matchesSearch((row as { provider_ref?: string | null }).provider_ref, normalizedSearch)) {
      ids.add(String((row as { id?: string }).id));
      continue;
    }
    if (
      matchesSearch((row as { bank_reference?: string | null }).bank_reference, normalizedSearch)
    ) {
      ids.add(String((row as { id?: string }).id));
    }
  }

  const supporterIds = (supporterRows ?? [])
    .filter(
      (row) =>
        matchesSearch((row as { name?: string | null }).name, normalizedSearch) ||
        matchesSearch((row as { email?: string | null }).email, normalizedSearch),
    )
    .map((row) => String((row as { id?: string }).id));

  if (supporterIds.length === 0) return [...ids];

  const donationRows: Array<{ id: string }> = [];
  for (const supporterIdChunk of uniqueChunks(supporterIds)) {
    const result = await readCountedRange<Record<string, unknown>>(() =>
      client
        .from("donation")
        .select("id", { count: "exact" })
        .in("supporter_id", supporterIdChunk)
        .order("id", { ascending: true }),
    );
    donationRows.push(...result.rows.map((row) => ({ id: String(row.id) })));
  }

  const donationIds = dedupeRowsById(donationRows).map((row) => row.id);
  if (donationIds.length === 0) return [...ids];

  const linkedPayments: Array<{ id: string }> = [];
  for (const donationIdChunk of uniqueChunks(donationIds)) {
    const result = await readCountedRange<Record<string, unknown>>(() =>
      client
        .from("payment")
        .select("id,donation_id", { count: "exact" })
        .in("donation_id", donationIdChunk)
        .order("id", { ascending: true }),
    );
    linkedPayments.push(...result.rows.map((row) => ({ id: String(row.id) })));
  }

  for (const row of dedupeRowsById(linkedPayments)) ids.add(row.id);
  return [...ids];
}

export async function listAdminPaymentPage(
  client: SupabaseClient,
  rawSearch: Record<string, string>,
): Promise<AdminPaymentListResult> {
  const filters = adminPaymentSearchSchema.parse(rawSearch);
  const paymentIds = await resolveSearchPaymentIds(client, filters.q);
  const from = (filters.page - 1) * filters.pageSize;

  let pageResult: { rows: AdminPaymentRow[]; count: number };
  let summaryRows: SummarizablePaymentRow[];
  if (paymentIds) {
    const filteredRows = await selectAllPaymentRows(client, filters, paymentIds);
    pageResult = {
      rows: filteredRows.slice(from, from + filters.pageSize),
      count: filteredRows.length,
    };
    summaryRows = filteredRows;
  } else {
    pageResult = await selectPaymentRows(client, filters, {
      from,
      to: from + filters.pageSize - 1,
    });
    summaryRows = await selectPaymentSummaryRows(client, filters);
  }
  const summaryReceipts = await listReceiptsForDonationIds(client, donationIdsFor(summaryRows));
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
    summary: summarizePayments(summaryRows, summaryReceipts),
  };
}

export async function listAdminPaymentExportRows(
  client: SupabaseClient,
  rawSearch: Record<string, string>,
): Promise<PaymentExportRow[]> {
  const filters = adminPaymentExportSearchSchema.parse(rawSearch);
  const paymentIds = await resolveSearchPaymentIds(client, filters.q);
  const rows = await selectAllPaymentRows(client, filters, paymentIds);

  return rows.map((payment) => ({
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
