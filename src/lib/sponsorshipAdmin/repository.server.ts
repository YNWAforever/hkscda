import type { SupabaseClient } from "@supabase/supabase-js";

import { selectReviewTargetProof } from "./proofReview";

import type {
  CancelPledgeInput,
  PaymentProofRecord,
  PledgeAnimalPreference,
  PledgeAuditEntry,
  PledgeDetail,
  PledgeListSearch,
  PledgeSummary,
  RecordPledgePaymentRepoInput,
  SponsorshipPeriodRecord,
  ReviewPledgeProofInput,
} from "./types";

type PledgeRow = {
  id: string;
  supporter_id: string;
  monthly_tier: PledgeSummary["monthlyTier"];
  amount_cents: number;
  currency: string;
  language: PledgeSummary["language"];
  notes: string | null;
  status: PledgeSummary["status"];
  created_at: string;
  updated_at: string;
};

type SupporterRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type PreferenceRow = {
  id: string;
  pledge_id: string;
  rank: number;
  sponsor_animal_id: string | null;
  animal_name_snapshot: string;
};

type ProofRow = {
  id: string;
  pledge_id: string;
  storage_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  payment_method: string;
  reference: string | null;
  amount_cents: number;
  payment_date: string;
  review_status: PaymentProofRecord["reviewStatus"];
  source: PaymentProofRecord["source"];
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

type PeriodRow = {
  id: string;
  pledge_id: string;
  period_month: string;
  committed_cents: number;
};

type AllocationRow = {
  id: string;
  period_id: string;
  proof_id: string;
  amount_cents: number;
  reverses_allocation_id: string | null;
  note: string | null;
  created_at: string;
};

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_id: string;
  detail: Record<string, unknown> | null;
  timestamp: string;
};

const PLEDGE_SEARCH_CANDIDATE_LIMIT = 1000;
const PLEDGE_SEARCH_TOO_BROAD_ERROR = "Pledge search matches too many records";

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function sanitizeOrLikeValue(value: string) {
  // PostgREST .or() uses comma and parentheses for grammar, so keep search terms literal.
  return escapeLike(
    value
      .replace(/[(),]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s+([%_])/g, "$1"),
  );
}

// Matches the human-facing reference format from `pledgeReference()`
// (src/lib/sponsorship/statusSummary.ts): "SP-" followed by the first 8 hex
// characters of the pledge id with dashes removed, which is always exactly
// the id's first dash-delimited segment. Only queries shaped like a
// reference (optionally partial) are treated as an id search; anything else
// (e.g. a supporter name) yields null and only the supporter-name/email
// branch runs.
const REFERENCE_QUERY_PATTERN = /^sp-?([0-9a-f]*)$/i;

function referenceSearchHexPrefix(q: string): string | null {
  const match = REFERENCE_QUERY_PATTERN.exec(q.trim());
  if (!match || match[1].length === 0) return null;
  return match[1].toLowerCase();
}

/**
 * Resolves the set of pledge ids that match a free-text search (`q`) against
 * the pledge's human-facing reference and the linked supporter's name/email.
 * Resolving ids up front lets the caller apply the filter in the SQL query
 * (via `.in()`) so that `count: "exact"` and pagination stay correct for
 * matches that fall outside the current page window.
 *
 * `sponsorship_pledge.id` is a `uuid` column, which Postgres has no
 * ilike/~~* operator for — a bare `.ilike("id", ...)` throws at the database
 * level. Reference search instead casts to text (`id::text`) via `.filter()`
 * and anchors the pattern to a prefix, since the reference only ever encodes
 * the id's first segment.
 */
async function searchPledgeIds(client: SupabaseClient, q: string): Promise<string[]> {
  const like = `%${sanitizeOrLikeValue(q)}%`;
  const hexPrefix = referenceSearchHexPrefix(q);

  const [directResult, supporterResult] = await Promise.all([
    hexPrefix
      ? client.from("sponsorship_pledge").select("id").filter("id::text", "ilike", `${hexPrefix}%`)
      : Promise.resolve({ data: [] as Array<{ id: string }>, error: null }),
    client.from("supporter").select("id").or(`name.ilike.${like},email.ilike.${like}`),
  ]);
  if (directResult.error) throw directResult.error;
  if (supporterResult.error) throw supporterResult.error;

  const directIds = ((directResult.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  const supporterIds = unique(
    ((supporterResult.data ?? []) as Array<{ id: string }>).map((row) => row.id),
  );

  if (supporterIds.length === 0) return unique(directIds);
  if (supporterIds.length > PLEDGE_SEARCH_CANDIDATE_LIMIT) {
    throw new Error(PLEDGE_SEARCH_TOO_BROAD_ERROR);
  }

  const pledgesBySupporterResult = await client
    .from("sponsorship_pledge")
    .select("id")
    .in("supporter_id", supporterIds);
  if (pledgesBySupporterResult.error) throw pledgesBySupporterResult.error;

  const pledgeIdsBySupporter = ((pledgesBySupporterResult.data ?? []) as Array<{ id: string }>).map(
    (row) => row.id,
  );

  const merged = unique([...directIds, ...pledgeIdsBySupporter]);
  if (merged.length > PLEDGE_SEARCH_CANDIDATE_LIMIT) {
    throw new Error(PLEDGE_SEARCH_TOO_BROAD_ERROR);
  }
  return merged;
}

function mapProof(row: ProofRow): PaymentProofRecord {
  return {
    id: row.id,
    pledgeId: row.pledge_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    paymentMethod: row.payment_method,
    reference: row.reference,
    amountCents: row.amount_cents,
    paymentDate: row.payment_date,
    reviewStatus: row.review_status,
    source: row.source,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
  };
}

/**
 * Joins months to the payments attributed to them. `allocatedCents` is summed
 * here rather than stored on the period: one number, derived, so the ledger and
 * the month can never disagree. A reversal carries a negative amount, so the
 * same sum handles refunds without a second code path.
 */
function mapPeriods(periodRows: PeriodRow[], allocationRows: AllocationRow[]) {
  const byPeriod = new Map<string, AllocationRow[]>();
  for (const row of allocationRows) {
    const bucket = byPeriod.get(row.period_id);
    if (bucket) bucket.push(row);
    else byPeriod.set(row.period_id, [row]);
  }

  return periodRows.map((row) => {
    const rows = byPeriod.get(row.id) ?? [];
    const allocatedCents = rows.reduce((sum, a) => sum + a.amount_cents, 0);
    return {
      id: row.id,
      periodMonth: row.period_month,
      committedCents: row.committed_cents,
      allocatedCents,
      outstandingCents: Math.max(0, row.committed_cents - allocatedCents),
      allocations: rows.map((a) => ({
        id: a.id,
        proofId: a.proof_id,
        amountCents: a.amount_cents,
        reversesAllocationId: a.reverses_allocation_id,
        note: a.note,
        createdAt: a.created_at,
      })),
    } satisfies SponsorshipPeriodRecord;
  });
}

function mapPreference(row: PreferenceRow): PledgeAnimalPreference {
  return {
    id: row.id,
    rank: row.rank,
    animalId: row.sponsor_animal_id,
    animalNameSnapshot: row.animal_name_snapshot,
  };
}

function mapAudit(row: AuditRow): PledgeAuditEntry {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    detail: row.detail ?? {},
    timestamp: row.timestamp,
  };
}

function mapSummary(row: PledgeRow, supporters: Map<string, SupporterRow>): PledgeSummary {
  const supporter = supporters.get(row.supporter_id);
  return {
    id: row.id,
    supporterId: row.supporter_id,
    supporterName: supporter?.name ?? row.supporter_id,
    supporterEmail: supporter?.email ?? null,
    monthlyTier: row.monthly_tier,
    amountCents: row.amount_cents,
    currency: row.currency,
    language: row.language,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadSupportersByIds(client: SupabaseClient, ids: string[]) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, SupporterRow>();

  const { data, error } = await client
    .from("supporter")
    .select("id,name,email,phone")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as SupporterRow[]).map((row) => [row.id, row]));
}

export type SponsorshipAdminRepository = {
  listPledges(input: PledgeListSearch): Promise<{ pledges: PledgeSummary[]; total: number }>;
  getPledgeDetail(id: string): Promise<PledgeDetail | null>;
  getProofSigningInfo(
    pledgeId: string,
  ): Promise<{ storagePath: string; fileName: string | null } | null>;
  recordPayment(input: RecordPledgePaymentRepoInput): Promise<{ id: string }>;
  reviewProof(
    input: ReviewPledgeProofInput & {
      pledgeId: string;
      actorUserId: string;
      /** Months this payment pays for. Empty for a rejection. */
      allocations?: Array<{ periodMonth: string; amountCents: number }>;
    },
  ): Promise<void>;
  cancelPledge(input: CancelPledgeInput & { pledgeId: string; actorUserId: string }): Promise<void>;
  allocateProof(input: AllocateProofInput): Promise<AllocateProofResult>;
};

export type AllocateProofInput = {
  proofId: string;
  actorUserId: string;
  allocations: Array<{ periodMonth: string; amountCents: number }>;
};

export type AllocateProofResult = {
  /** `already_allocated` means a previous attempt had committed — not an error. */
  status: "allocated" | "already_allocated";
  allocatedCents: number;
};

export function createSupabaseSponsorshipAdminRepository(
  client: SupabaseClient,
): SponsorshipAdminRepository {
  return {
    async listPledges(input) {
      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("sponsorship_pledge")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + input.pageSize - 1);

      if (input.status) query = query.eq("status", input.status);

      if (input.q) {
        const candidateIds = await searchPledgeIds(client, input.q);
        if (candidateIds.length === 0) return { pledges: [], total: 0 };
        query = query.in("id", candidateIds);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const rows = (data ?? []) as PledgeRow[];
      const supporters = await loadSupportersByIds(
        client,
        rows.map((row) => row.supporter_id),
      );

      const summaries = rows.map((row) => mapSummary(row, supporters));

      return { pledges: summaries, total: count ?? summaries.length };
    },

    async getPledgeDetail(id) {
      const { data: pledgeData, error: pledgeError } = await client
        .from("sponsorship_pledge")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (pledgeError) throw pledgeError;
      if (!pledgeData) return null;

      const row = pledgeData as PledgeRow;

      const [supporters, preferencesResult, proofResult, auditResult, periodResult] =
        await Promise.all([
          loadSupportersByIds(client, [row.supporter_id]),
          client
            .from("sponsorship_preference")
            .select("*")
            .eq("pledge_id", id)
            .order("rank", { ascending: true }),
          // Newest-first, because this is the history list staff read. It is NOT
          // the review order: `currentProof` below is chosen by
          // `selectReviewTargetProof`, which must agree with
          // review_sponsorship_payment_proof's own `order by created_at asc, id
          // asc` — see proofReview.ts for why the queue drains oldest-first.
          client
            .from("sponsorship_payment_proof")
            .select("*")
            .eq("pledge_id", id)
            .order("created_at", { ascending: false }),
          client
            .from("audit_log")
            .select("id,actor_user_id,action,entity_id,detail,timestamp")
            .eq("entity_id", id)
            .order("timestamp", { ascending: false })
            .limit(20),
          // The monthly ledger, oldest month first — months read as a sequence,
          // unlike the proof history, which reads newest-first.
          client
            .from("sponsorship_period")
            .select("id,pledge_id,period_month,committed_cents")
            .eq("pledge_id", id)
            .order("period_month", { ascending: true }),
        ]);
      if (preferencesResult.error) throw preferencesResult.error;
      if (proofResult.error) throw proofResult.error;
      if (auditResult.error) throw auditResult.error;
      if (periodResult.error) throw periodResult.error;

      const periodRows = (periodResult.data ?? []) as PeriodRow[];
      // Allocations are fetched separately rather than through a nested select:
      // a pledge with no months must still return an empty ledger, not fail.
      const allocationResult = periodRows.length
        ? await client
            .from("sponsorship_payment_allocation")
            .select("id,period_id,proof_id,amount_cents,reverses_allocation_id,note,created_at")
            .in(
              "period_id",
              periodRows.map((row) => row.id),
            )
            .order("created_at", { ascending: true })
        : { data: [] as AllocationRow[], error: null };
      if (allocationResult.error) throw allocationResult.error;

      const preferences = ((preferencesResult.data ?? []) as PreferenceRow[]).map(mapPreference);
      const proofRows = (proofResult.data ?? []) as ProofRow[];
      const proofHistory = proofRows.map(mapProof);
      const auditLog = ((auditResult.data ?? []) as AuditRow[]).map(mapAudit);

      return {
        ...mapSummary(row, supporters),
        notes: row.notes,
        supporterPhone: supporters.get(row.supporter_id)?.phone ?? null,
        preferences,
        proofHistory,
        currentProof: selectReviewTargetProof(proofHistory),
        periods: mapPeriods(periodRows, (allocationResult.data ?? []) as AllocationRow[]),
        recentAuditLog: auditLog,
      } satisfies PledgeDetail;
    },

    async getProofSigningInfo(pledgeId) {
      // Signs the file for the proof under review — the same row
      // `getPledgeDetail` exposes as `currentProof` and the same row the RPC
      // will update. Signing the newest row instead would show staff one
      // document while their approve/reject decision landed on another.
      const { data, error } = await client
        .from("sponsorship_payment_proof")
        .select("id,storage_path,file_name,review_status,created_at")
        .eq("pledge_id", pledgeId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      type SigningRow = Pick<
        ProofRow,
        "id" | "storage_path" | "file_name" | "review_status" | "created_at"
      >;
      const row = selectReviewTargetProof(
        ((data ?? []) as SigningRow[]).map((proofRow) => ({
          ...proofRow,
          createdAt: proofRow.created_at,
          reviewStatus: proofRow.review_status,
        })),
      );
      if (!row) return null;
      // A staff-recorded payment may have no attached file: there is no
      // storage object to sign a URL for, so treat it the same as "no proof".
      if (!row.storage_path) return null;

      return { storagePath: row.storage_path, fileName: row.file_name };
    },

    async recordPayment(input) {
      const { data, error } = await client.rpc("record_sponsorship_payment_proof", {
        p_pledge_id: input.pledgeId,
        p_actor_user_id: input.actorUserId,
        p_storage_path: input.storagePath,
        p_file_name: input.fileName,
        p_file_type: input.fileType,
        p_file_size: input.fileSize,
        p_payment_method: input.paymentMethod,
        p_reference: input.reference ?? null,
        p_amount_cents: input.amountCents,
        p_payment_date: input.paymentDate,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return { id: data as string };
    },

    async reviewProof(input) {
      // The allocation travels with the decision so both commit in one
      // transaction -- see proofReview.ts and the ledger migration.
      const { error } = await client.rpc("review_sponsorship_payment_proof", {
        p_pledge_id: input.pledgeId,
        p_decision: input.decision,
        p_actor_user_id: input.actorUserId,
        p_note: input.note ?? null,
        p_allocations: input.allocations ?? [],
      });
      if (error) throw error;
    },

    async allocateProof(input) {
      const { data, error } = await client.rpc("allocate_sponsorship_payment_with_audit", {
        p_proof_id: input.proofId,
        p_actor_user_id: input.actorUserId,
        p_allocations: input.allocations,
      });
      if (error) throw error;

      const result = (data ?? {}) as { status?: string; allocatedCents?: number };
      return {
        status: result.status === "already_allocated" ? "already_allocated" : "allocated",
        allocatedCents: result.allocatedCents ?? 0,
      };
    },

    async cancelPledge(input) {
      const { error } = await client.rpc("cancel_sponsorship_pledge", {
        p_pledge_id: input.pledgeId,
        p_actor_user_id: input.actorUserId,
        p_note: input.note ?? null,
      });
      if (error) throw error;
    },
  };
}
