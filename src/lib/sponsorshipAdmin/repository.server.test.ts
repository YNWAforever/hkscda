import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseSponsorshipAdminRepository } from "./repository.server";

const pledgeId = "11111111-2222-4333-8444-555555555555";
const actorUserId = "22222222-3333-4333-8444-555555555555";
const proofId = "33333333-4444-4333-8444-555555555555";

type Call = { table?: string; fn?: string; method: string; payload?: unknown };

function pledgeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: pledgeId,
    supporter_id: "supporter-1",
    monthly_tier: "300",
    amount_cents: 30000,
    currency: "HKD",
    language: "zh-HK",
    notes: null,
    status: "provisional",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function supporterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "supporter-1",
    name: "陳小姐",
    email: "chan@example.com",
    phone: "91234567",
    ...overrides,
  };
}

function proofRow(overrides: Record<string, unknown> = {}) {
  return {
    id: proofId,
    pledge_id: pledgeId,
    storage_path: `${pledgeId}/proof.jpg`,
    file_name: "proof.jpg",
    file_type: "image/jpeg",
    file_size: 2048,
    payment_method: "fps",
    reference: "REF1",
    amount_cents: 30000,
    payment_date: "2026-07-01",
    review_status: "pending",
    source: "public",
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function matchesLike(value: unknown, pattern: string) {
  if (value === null || value === undefined) return false;
  const needle = pattern
    .replace(/^%/, "")
    .replace(/%$/, "")
    .replaceAll("\\%", "%")
    .replaceAll("\\_", "_")
    .toLowerCase();
  return String(value).toLowerCase().includes(needle);
}

function matchesOrFilter(row: Record<string, unknown>, filter: string) {
  return filter.split(",").some((part) => {
    const [column, pattern] = part.split(".ilike.");
    if (!column || !pattern || column.includes(".")) return false;
    return matchesLike(row[column], pattern);
  });
}

class FakeQuery {
  private filters: Array<{ column: string; value: unknown }> = [];
  private likeFilters: Array<{ column: string; value: string }> = [];
  private orFilters: string[] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private rangeBounds: [number, number] | null = null;
  private countMode: string | undefined;

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  select(_columns: string, options?: { count?: string }) {
    this.state.calls.push({ table: this.table, method: "select" });
    this.countMode = options?.count;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    this.state.calls.push({ table: this.table, method: "eq", payload: { column, value } });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, value: values });
    this.state.calls.push({ table: this.table, method: "in", payload: { column, values } });
    return this;
  }

  ilike(column: string, value: unknown) {
    this.likeFilters.push({ column, value: String(value) });
    this.state.calls.push({ table: this.table, method: "ilike", payload: { column, value } });
    return this;
  }

  filter(column: string, operator: string, value: unknown) {
    // PostgREST supports a `column::type` cast prefix (used here for
    // `id::text` since uuid columns have no ilike operator); the fake only
    // needs to match against the underlying column, so strip the cast.
    const baseColumn = column.split("::")[0];
    if (operator === "ilike") {
      this.likeFilters.push({ column: baseColumn, value: String(value) });
    }
    this.state.calls.push({
      table: this.table,
      method: "filter",
      payload: { column, operator, value },
    });
    return this;
  }

  or(filters: string) {
    this.orFilters.push(filters);
    this.state.calls.push({ table: this.table, method: "or", payload: filters });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderCol = column;
    this.orderAsc = options?.ascending !== false;
    return this;
  }

  range(from: number, to: number) {
    this.rangeBounds = [from, to];
    return this;
  }

  limit(_n: number) {
    return this;
  }

  private rowsForTable(): Record<string, unknown>[] {
    if (this.table === "sponsorship_pledge") return this.state.pledgeRows;
    if (this.table === "supporter") return this.state.supporterRows;
    if (this.table === "sponsorship_preference") return this.state.preferenceRows;
    if (this.table === "sponsorship_payment_proof") return this.state.proofRows;
    if (this.table === "audit_log") return this.state.auditRows;
    if (this.table === "sponsorship_assignment") return this.state.assignmentRows;
    if (this.table === "sponsorship_period") return this.state.periodRows;
    if (this.table === "sponsorship_payment_allocation") return this.state.allocationRows;
    return [];
  }

  private filteredRows() {
    let rows = this.rowsForTable();
    for (const filter of this.filters) {
      rows = rows.filter((row) => {
        if (Array.isArray(filter.value)) return filter.value.includes(row[filter.column]);
        return row[filter.column] === filter.value;
      });
    }
    for (const like of this.likeFilters) {
      rows = rows.filter((row) => matchesLike(row[like.column], like.value));
    }
    for (const orFilter of this.orFilters) {
      rows = rows.filter((row) => matchesOrFilter(row, orFilter));
    }
    if (this.orderCol) {
      rows = [...rows].sort((left, right) => {
        const l = String(left[this.orderCol as string]);
        const r = String(right[this.orderCol as string]);
        return this.orderAsc ? l.localeCompare(r) : r.localeCompare(l);
      });
    }
    return rows;
  }

  async maybeSingle() {
    const rows = this.filteredRows();
    return { data: rows[0] ?? null, error: null };
  }

  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    let rows = this.filteredRows();
    const total = rows.length;
    if (this.rangeBounds) rows = rows.slice(this.rangeBounds[0], this.rangeBounds[1] + 1);
    const result = { data: rows, error: null, count: this.countMode ? total : null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

type FakeState = {
  calls: Call[];
  pledgeRows: Record<string, unknown>[];
  supporterRows: Record<string, unknown>[];
  preferenceRows: Record<string, unknown>[];
  proofRows: Record<string, unknown>[];
  auditRows: Record<string, unknown>[];
  assignmentRows: Record<string, unknown>[];
  periodRows: Record<string, unknown>[];
  allocationRows: Record<string, unknown>[];
  rpcError: Error | null;
  rpcResult: unknown;
};

function createFakeClient(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    calls: [],
    pledgeRows: [pledgeRow()],
    supporterRows: [supporterRow()],
    preferenceRows: [],
    proofRows: [proofRow()],
    auditRows: [],
    assignmentRows: [],
    periodRows: [],
    allocationRows: [],
    rpcError: null,
    rpcResult: null,
    ...overrides,
  };

  const client = {
    from(table: string) {
      return new FakeQuery(state, table);
    },
    async rpc(fn: string, payload: unknown) {
      state.calls.push({ fn, method: "rpc", payload });
      if (state.rpcError) return { data: null, error: state.rpcError };
      return { data: state.rpcResult, error: null };
    },
  };

  return { client: client as unknown as SupabaseClient, state };
}

describe("createSupabaseSponsorshipAdminRepository", () => {
  test("recordPayment calls record_sponsorship_payment_proof with mapped params", async () => {
    const { client, state } = createFakeClient();
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await repo.recordPayment({
      pledgeId,
      actorUserId,
      storagePath: `${pledgeId}/proof.jpg`,
      fileName: "proof.jpg",
      fileType: "image/jpeg",
      fileSize: 2048,
      paymentMethod: "fps",
      reference: "REF1",
      amountCents: 30000,
      paymentDate: "2026-07-01",
      note: "Recorded manually",
    });

    const call = state.calls.find((c) => c.fn === "record_sponsorship_payment_proof");
    expect(call?.payload).toEqual({
      p_pledge_id: pledgeId,
      p_actor_user_id: actorUserId,
      p_storage_path: `${pledgeId}/proof.jpg`,
      p_file_name: "proof.jpg",
      p_file_type: "image/jpeg",
      p_file_size: 2048,
      p_payment_method: "fps",
      p_reference: "REF1",
      p_amount_cents: 30000,
      p_payment_date: "2026-07-01",
      p_note: "Recorded manually",
    });
  });

  test("recordPayment passes null file fields through to the RPC when no file is given", async () => {
    const { client, state } = createFakeClient();
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await repo.recordPayment({
      pledgeId,
      actorUserId,
      storagePath: null,
      fileName: null,
      fileType: null,
      fileSize: null,
      paymentMethod: "fps",
      reference: "REF1",
      amountCents: 30000,
      paymentDate: "2026-07-01",
      note: "Verified directly in the bank system",
    });

    const call = state.calls.find((c) => c.fn === "record_sponsorship_payment_proof");
    expect(call?.payload).toEqual({
      p_pledge_id: pledgeId,
      p_actor_user_id: actorUserId,
      p_storage_path: null,
      p_file_name: null,
      p_file_type: null,
      p_file_size: null,
      p_payment_method: "fps",
      p_reference: "REF1",
      p_amount_cents: 30000,
      p_payment_date: "2026-07-01",
      p_note: "Verified directly in the bank system",
    });
  });

  test("recordPayment throws when the RPC errors", async () => {
    const { client } = createFakeClient({ rpcError: new Error("boom") });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await expect(
      repo.recordPayment({
        pledgeId,
        actorUserId,
        storagePath: "x",
        fileName: "x",
        fileType: "image/jpeg",
        fileSize: 1,
        paymentMethod: "fps",
        reference: null,
        amountCents: 1,
        paymentDate: "2026-07-01",
        note: null,
      }),
    ).rejects.toThrow("boom");
  });

  test("reviewProof calls review_sponsorship_payment_proof with mapped params", async () => {
    const { client, state } = createFakeClient();
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await repo.reviewProof({ pledgeId, decision: "approve", actorUserId, note: "Looks good" });

    const call = state.calls.find((c) => c.fn === "review_sponsorship_payment_proof");
    expect(call?.payload).toEqual({
      p_pledge_id: pledgeId,
      p_decision: "approve",
      p_actor_user_id: actorUserId,
      p_note: "Looks good",
      p_allocations: [],
      // The animal to confirm rides along with the decision, so approving,
      // attributing and confirming all commit in one transaction.
      p_assign_animal_id: null,
    });
  });

  test("assignAnimal calls the audited RPC with mapped params", async () => {
    const { client, state } = createFakeClient({ rpcResult: "asg-1" });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const result = await repo.assignAnimal({
      pledgeId,
      animalId: "animal-1",
      actorUserId,
      note: "Supporter asked for this cat",
    });

    const call = state.calls.find((c) => c.fn === "assign_sponsorship_animal_with_audit");
    expect(call?.payload).toEqual({
      p_pledge_id: pledgeId,
      p_animal_id: "animal-1",
      p_actor_user_id: actorUserId,
      p_note: "Supporter asked for this cat",
    });
    expect(result).toEqual({ id: "asg-1" });
  });

  test("endAssignment calls the audited RPC with mapped params", async () => {
    const { client, state } = createFakeClient();
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await repo.endAssignment({
      assignmentId: "asg-1",
      actorUserId,
      reason: "adopted",
      note: null,
    });

    const call = state.calls.find((c) => c.fn === "end_sponsorship_assignment_with_audit");
    expect(call?.payload).toEqual({
      p_assignment_id: "asg-1",
      p_actor_user_id: actorUserId,
      p_reason: "adopted",
      p_note: null,
    });
  });

  test("cancelPledge calls cancel_sponsorship_pledge with mapped params", async () => {
    const { client, state } = createFakeClient();
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await repo.cancelPledge({ pledgeId, actorUserId, note: "Sponsor asked to cancel" });

    const call = state.calls.find((c) => c.fn === "cancel_sponsorship_pledge");
    expect(call?.payload).toEqual({
      p_pledge_id: pledgeId,
      p_actor_user_id: actorUserId,
      p_note: "Sponsor asked to cancel",
    });
  });

  test("listPledges returns mapped summaries and total", async () => {
    const { client } = createFakeClient({
      pledgeRows: [pledgeRow(), pledgeRow({ id: "pledge-2", supporter_id: "supporter-2" })],
      supporterRows: [supporterRow(), supporterRow({ id: "supporter-2", name: "李先生" })],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const result = await repo.listPledges({ page: 1, pageSize: 25 });
    expect(result.total).toBe(2);
    expect(result.pledges).toHaveLength(2);
    expect(result.pledges[0].supporterName).toBe("陳小姐");
  });

  test("listPledges filters by status", async () => {
    const { client } = createFakeClient({
      pledgeRows: [
        pledgeRow({ status: "active" }),
        pledgeRow({ id: "pledge-2", status: "cancelled" }),
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const result = await repo.listPledges({ status: "active", page: 1, pageSize: 25 });
    expect(result.pledges).toHaveLength(1);
    expect(result.pledges[0].status).toBe("active");
  });

  test("listPledges filters by q against supporter name and email", async () => {
    const { client } = createFakeClient({
      pledgeRows: [
        pledgeRow({ id: "pledge-1", supporter_id: "supporter-1" }),
        pledgeRow({ id: "pledge-2", supporter_id: "supporter-2" }),
      ],
      supporterRows: [
        supporterRow({ id: "supporter-1", name: "陳小姐", email: "chan@example.com" }),
        supporterRow({ id: "supporter-2", name: "李先生", email: "lee@example.com" }),
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const result = await repo.listPledges({ q: "陳", page: 1, pageSize: 25 });
    expect(result.pledges).toHaveLength(1);
    expect(result.pledges[0].id).toBe("pledge-1");
    expect(result.total).toBe(1);
  });

  test("listPledges filters by q against the pledge's human-facing reference", async () => {
    // pledgeReference() (src/lib/sponsorship/statusSummary.ts) formats a
    // pledge's reference as "SP-" + the id's first segment, e.g. `pledgeId`
    // here ("11111111-...") displays as "SP-11111111". `sponsorship_pledge.id`
    // is a uuid column with no ilike operator, so this exercises the
    // `id::text` cast path via `.filter()` rather than `.ilike()`.
    const otherPledgeId = "99999999-2222-4333-8444-555555555555";
    const { client } = createFakeClient({
      pledgeRows: [
        pledgeRow({ id: pledgeId, supporter_id: "supporter-1" }),
        pledgeRow({ id: otherPledgeId, supporter_id: "supporter-2" }),
      ],
      supporterRows: [
        supporterRow({ id: "supporter-1", name: "陳小姐", email: "chan@example.com" }),
        supporterRow({ id: "supporter-2", name: "李先生", email: "lee@example.com" }),
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const result = await repo.listPledges({ q: "SP-1111", page: 1, pageSize: 25 });
    expect(result.pledges).toHaveLength(1);
    expect(result.pledges[0].id).toBe(pledgeId);
    expect(result.total).toBe(1);
  });

  test("listPledges treats a non-reference-shaped q as a supporter-only search", async () => {
    // "spare" starts with "sp" but isn't a valid reference query (has non-hex
    // trailing characters), so it must not be treated as an id search.
    const { client } = createFakeClient({
      pledgeRows: [pledgeRow({ id: pledgeId, supporter_id: "supporter-1" })],
      supporterRows: [supporterRow({ id: "supporter-1", name: "spare parts", email: null })],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const result = await repo.listPledges({ q: "spare", page: 1, pageSize: 25 });
    expect(result.pledges).toHaveLength(1);
    expect(result.pledges[0].id).toBe(pledgeId);
  });

  test("listPledges q search returns correct total and later matches when combined with pagination", async () => {
    // Six pledges from supporter-1 (matching `q`) interleaved with noise pledges
    // from supporter-2 (non-matching), with pageSize 5. Ordered by created_at
    // desc, the 6th match falls on page 2. This reproduces the scenario where
    // an in-memory filter applied after `.range()` would report a `total` that
    // only reflects the unfiltered/status-filtered row count (12 here, not 6),
    // and would drop matches that fall outside the already-paginated DB window.
    const matching = Array.from({ length: 6 }, (_, i) =>
      pledgeRow({
        id: `pledge-match-${i}`,
        supporter_id: "supporter-1",
        created_at: `2026-07-${String(10 - i).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const nonMatching = Array.from({ length: 6 }, (_, i) =>
      pledgeRow({
        id: `pledge-noise-${i}`,
        supporter_id: "supporter-2",
        created_at: `2026-06-${String(20 - i).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const pledgeRows = [...matching, ...nonMatching];

    const { client } = createFakeClient({
      pledgeRows,
      supporterRows: [
        supporterRow({ id: "supporter-1", name: "陳小姐", email: "chan@example.com" }),
        supporterRow({ id: "supporter-2", name: "李先生", email: "lee@example.com" }),
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const page1 = await repo.listPledges({ q: "陳", page: 1, pageSize: 5 });
    expect(page1.total).toBe(6);
    expect(page1.pledges.map((p) => p.id)).toEqual([
      "pledge-match-0",
      "pledge-match-1",
      "pledge-match-2",
      "pledge-match-3",
      "pledge-match-4",
    ]);

    const page2 = await repo.listPledges({ q: "陳", page: 2, pageSize: 5 });
    expect(page2.total).toBe(6);
    expect(page2.pledges.map((p) => p.id)).toEqual(["pledge-match-5"]);
  });

  test("listPledges throws when q matches more supporters than the candidate limit", async () => {
    // PLEDGE_SEARCH_CANDIDATE_LIMIT is 1000; 1001 matching supporters must trip
    // the "too broad" guard rather than proceeding to an unbounded `.in()` filter.
    const supporterRows = Array.from({ length: 1001 }, (_, i) =>
      supporterRow({ id: `supporter-${i}`, name: "陳小姐", email: `chan${i}@example.com` }),
    );
    const { client } = createFakeClient({ pledgeRows: [], supporterRows });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await expect(repo.listPledges({ q: "陳", page: 1, pageSize: 25 })).rejects.toThrow(
      "Pledge search matches too many records",
    );
  });

  test("listPledges throws when matched supporters' pledges exceed the candidate limit", async () => {
    // A single supporter can have many pledges (supporter_id is not unique on
    // sponsorship_pledge), so the "too broad" guard must also bound the
    // merged pledge-id candidate list, not just the matched-supporter count.
    const pledgeRows = Array.from({ length: 1001 }, (_, i) =>
      pledgeRow({ id: `pledge-${i}`, supporter_id: "supporter-1" }),
    );
    const { client } = createFakeClient({
      pledgeRows,
      supporterRows: [
        supporterRow({ id: "supporter-1", name: "陳小姐", email: "chan@example.com" }),
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await expect(repo.listPledges({ q: "陳", page: 1, pageSize: 25 })).rejects.toThrow(
      "Pledge search matches too many records",
    );
  });

  test("listPledges returns empty results when q matches no supporter or pledge", async () => {
    const { client } = createFakeClient({
      pledgeRows: [pledgeRow()],
      supporterRows: [supporterRow()],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const result = await repo.listPledges({ q: "no-such-match", page: 1, pageSize: 25 });
    expect(result.pledges).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  test("getPledgeDetail returns null when not found", async () => {
    const { client } = createFakeClient({ pledgeRows: [] });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    expect(await repo.getPledgeDetail("missing-id")).toBeNull();
  });

  test("getPledgeDetail composes preferences, proof history, and audit log", async () => {
    const { client } = createFakeClient({
      preferenceRows: [
        {
          id: "pref-1",
          pledge_id: pledgeId,
          rank: 1,
          sponsor_animal_id: "animal-1",
          animal_name_snapshot: "白雪",
        },
      ],
      proofRows: [proofRow()],
      auditRows: [
        {
          id: "audit-1",
          actor_user_id: actorUserId,
          action: "sponsorship_pledge.proof_recorded",
          entity_id: pledgeId,
          detail: {},
          timestamp: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);
    expect(detail?.preferences).toHaveLength(1);
    expect(detail?.currentProof?.id).toBe(proofId);
    expect(detail?.proofHistory).toHaveLength(1);
    expect(detail?.recentAuditLog).toHaveLength(1);
  });

  test("getPledgeDetail picks the oldest PENDING proof as currentProof, regardless of input order", async () => {
    // Three months of a running sponsorship: month one approved, months two and
    // three still queued. Supplied out of chronological order so that a naive
    // "take index 0 of whatever was given" implementation fails.
    //
    // currentProof must be month two — the oldest still awaiting review.
    // Newest-first would land on month three and strand month two forever: it
    // can never become the newest again, so no later review could reach it and
    // a real recorded payment would sit unreviewed with no way to act on it.
    // This must agree with review_sponsorship_payment_proof's own
    // `order by created_at asc, id asc` (20260911180000).
    const monthOne = proofRow({
      id: "proof-month-1",
      created_at: "2026-06-01T00:00:00.000Z",
      review_status: "approved",
    });
    const monthTwo = proofRow({ id: "proof-month-2", created_at: "2026-07-01T00:00:00.000Z" });
    const monthThree = proofRow({ id: "proof-month-3", created_at: "2026-07-15T00:00:00.000Z" });

    const { client } = createFakeClient({
      proofRows: [monthOne, monthThree, monthTwo],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);

    expect(detail?.currentProof?.id).toBe("proof-month-2");
    // The other rows must still surface in the full history, in newest-first
    // order — this rules out "current picks right but history silently drops
    // rows" as a false-positive pass. History order is a display choice and is
    // deliberately the opposite of the review order.
    expect(detail?.proofHistory.map((p) => p.id)).toEqual([
      "proof-month-3",
      "proof-month-2",
      "proof-month-1",
    ]);
  });

  test("getPledgeDetail reports no currentProof once every proof is decided", async () => {
    // Between months. Offering a review action here would give staff buttons
    // the database refuses, so the absence is the point.
    const { client } = createFakeClient({
      proofRows: [proofRow({ id: "proof-month-1", review_status: "approved" })],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);

    expect(detail?.currentProof).toBeNull();
    expect(detail?.proofHistory).toHaveLength(1);
  });

  test("getPledgeDetail sums each month's allocations into the ledger", async () => {
    // September was settled by two payments — a partial and a top-up — so the
    // month's paid figure has to be the SUM of its allocations. Storing a
    // paid/allocated column on the period instead would be a second set of
    // books that could drift from the allocations themselves.
    const { client } = createFakeClient({
      periodRows: [
        { id: "per-aug", pledge_id: pledgeId, period_month: "2026-08-01", committed_cents: 10000 },
        { id: "per-sep", pledge_id: pledgeId, period_month: "2026-09-01", committed_cents: 10000 },
      ],
      allocationRows: [
        {
          id: "alloc-1",
          period_id: "per-aug",
          proof_id: "proof-1",
          amount_cents: 10000,
          reverses_allocation_id: null,
          note: null,
          created_at: "2026-08-02T00:00:00.000Z",
        },
        {
          id: "alloc-2",
          period_id: "per-sep",
          proof_id: "proof-2",
          amount_cents: 6000,
          reverses_allocation_id: null,
          note: null,
          created_at: "2026-09-02T00:00:00.000Z",
        },
        {
          id: "alloc-3",
          period_id: "per-sep",
          proof_id: "proof-3",
          amount_cents: 4000,
          reverses_allocation_id: null,
          note: null,
          created_at: "2026-09-20T00:00:00.000Z",
        },
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);

    expect(detail?.periods.map((p) => p.periodMonth)).toEqual(["2026-08-01", "2026-09-01"]);
    expect(detail?.periods[1].allocatedCents).toBe(10000);
    expect(detail?.periods[1].allocations).toHaveLength(2);
    expect(detail?.periods.every((p) => p.outstandingCents === 0)).toBe(true);
  });

  test("getPledgeDetail treats a reversal as money taken back off the month", async () => {
    // A refund is a negative allocation, so the same sum handles it and the
    // month returns to outstanding — without deleting the original entry, which
    // stays visible as something that happened and was undone.
    const { client } = createFakeClient({
      periodRows: [
        { id: "per-aug", pledge_id: pledgeId, period_month: "2026-08-01", committed_cents: 10000 },
      ],
      allocationRows: [
        {
          id: "alloc-1",
          period_id: "per-aug",
          proof_id: "proof-1",
          amount_cents: 10000,
          reverses_allocation_id: null,
          note: null,
          created_at: "2026-08-02T00:00:00.000Z",
        },
        {
          id: "alloc-2",
          period_id: "per-aug",
          proof_id: "proof-1",
          amount_cents: -10000,
          reverses_allocation_id: "alloc-1",
          note: "supporter refunded",
          created_at: "2026-08-20T00:00:00.000Z",
        },
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);

    expect(detail?.periods[0].allocatedCents).toBe(0);
    expect(detail?.periods[0].outstandingCents).toBe(10000);
    expect(detail?.periods[0].allocations).toHaveLength(2);
  });

  test("getPledgeDetail returns an empty ledger without querying allocations", async () => {
    // A pledge whose first payment is not yet approved has no months. The
    // allocation query must be skipped entirely rather than sent with an empty
    // id list, which PostgREST would reject.
    const { client, state } = createFakeClient();
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);

    expect(detail?.periods).toEqual([]);
    expect(
      state.calls.some((c) => "table" in c && c.table === "sponsorship_payment_allocation"),
    ).toBe(false);
  });

  test("allocateProof passes the planned months to the audited RPC", async () => {
    const { client, state } = createFakeClient({
      rpcResult: { status: "allocated", allocatedCents: 20000 },
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const result = await repo.allocateProof({
      proofId: "proof-1",
      actorUserId,
      allocations: [
        { periodMonth: "2026-08-01", amountCents: 10000 },
        { periodMonth: "2026-09-01", amountCents: 10000 },
      ],
    });

    const call = state.calls.find((c) => c.fn === "allocate_sponsorship_payment_with_audit");
    expect(call?.payload).toEqual({
      p_proof_id: "proof-1",
      p_actor_user_id: actorUserId,
      p_allocations: [
        { periodMonth: "2026-08-01", amountCents: 10000 },
        { periodMonth: "2026-09-01", amountCents: 10000 },
      ],
    });
    expect(result).toEqual({ status: "allocated", allocatedCents: 20000 });
  });

  test("allocateProof reports an already-allocated payment as success, not failure", async () => {
    // The RPC is idempotent by claim: a retry after a lost response finds the
    // allocation already committed. Treating that as an error would push staff
    // to allocate again and double-count the payment.
    const { client } = createFakeClient({
      rpcResult: { status: "already_allocated", allocations: [] },
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const result = await repo.allocateProof({
      proofId: "proof-1",
      actorUserId,
      allocations: [{ periodMonth: "2026-08-01", amountCents: 10000 }],
    });

    expect(result.status).toBe("already_allocated");
  });

  test("getProofSigningInfo signs the same proof getPledgeDetail calls current", async () => {
    // The file staff look at and the row their decision updates must be the
    // same one. Signing the newest row instead would show them month three's
    // receipt while approving month two's payment.
    const monthTwo = proofRow({
      id: "proof-month-2",
      created_at: "2026-07-01T00:00:00.000Z",
      storage_path: `${pledgeId}/month-2.jpg`,
      file_name: "month-2.jpg",
    });
    const monthThree = proofRow({
      id: "proof-month-3",
      created_at: "2026-07-15T00:00:00.000Z",
      storage_path: `${pledgeId}/month-3.jpg`,
      file_name: "month-3.jpg",
    });

    const { client } = createFakeClient({ proofRows: [monthThree, monthTwo] });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);
    const info = await repo.getProofSigningInfo(pledgeId);

    expect(detail?.currentProof?.id).toBe("proof-month-2");
    expect(info).toEqual({
      storagePath: `${pledgeId}/month-2.jpg`,
      fileName: "month-2.jpg",
    });
  });

  test("getProofSigningInfo returns the current proof's storage location", async () => {
    const { client } = createFakeClient({ proofRows: [proofRow()] });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const info = await repo.getProofSigningInfo(pledgeId);
    expect(info).toEqual({
      storagePath: `${pledgeId}/proof.jpg`,
      fileName: "proof.jpg",
    });
  });

  test("getProofSigningInfo returns null when there is no proof", async () => {
    const { client } = createFakeClient({ proofRows: [] });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    expect(await repo.getProofSigningInfo(pledgeId)).toBeNull();
  });

  test("getProofSigningInfo returns null when the current proof has no attached file", async () => {
    const { client } = createFakeClient({
      proofRows: [
        proofRow({ storage_path: null, file_name: null, file_type: null, file_size: null }),
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    expect(await repo.getProofSigningInfo(pledgeId)).toBeNull();
  });

  test("getPledgeDetail lists open assignments before ended ones", async () => {
    const { client } = createFakeClient({
      assignmentRows: [
        {
          id: "asg-ended",
          pledge_id: pledgeId,
          animal_id: "animal-1",
          animal_name_snapshot: "小白",
          started_on: "2026-06-01",
          ended_on: "2026-07-15",
          end_reason: "adopted",
          note: null,
          end_note: null,
        },
        {
          id: "asg-open",
          pledge_id: pledgeId,
          animal_id: "animal-2",
          animal_name_snapshot: "阿花",
          started_on: "2026-08-01",
          ended_on: null,
          end_reason: null,
          note: null,
          end_note: null,
        },
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);

    // Open first: it is what staff act on. The ended one stays as history
    // rather than being hidden.
    expect(detail?.assignments.map((a) => a.id)).toEqual(["asg-open", "asg-ended"]);
    expect(detail?.assignments[1].endReason).toBe("adopted");
  });

  test("getPledgeDetail carries the assigned animal's embedded state onto the assignment", async () => {
    const { client } = createFakeClient({
      // No preference row at all: this is the hand-added animal, which is on no
      // shortlist. The state has to come off the assigned animal itself.
      preferenceRows: [],
      assignmentRows: [
        {
          id: "asg-open",
          pledge_id: pledgeId,
          animal_id: "animal-1",
          animal_name_snapshot: "小白",
          started_on: "2026-08-01",
          ended_on: null,
          end_reason: null,
          note: null,
          end_note: null,
          animal: {
            sponsorship_eligible: true,
            status: "adopted",
            retired_at: null,
            publication_state: "published",
            animal_profile_internal: { deceased_at: null },
          },
        },
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);

    expect(detail?.assignments[0].animalState).toEqual({
      sponsorshipEligible: true,
      status: "adopted",
      retiredAt: null,
      publicationState: "published",
      deceasedAt: null,
    });
    // The repository reports the state; the service turns it into a reason.
    expect(detail?.assignments[0].reviewReason).toBeNull();
  });

  test("getPledgeDetail returns an empty assignment list when there are none", async () => {
    const { client } = createFakeClient();
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);

    expect(detail?.assignments).toEqual([]);
  });
});
