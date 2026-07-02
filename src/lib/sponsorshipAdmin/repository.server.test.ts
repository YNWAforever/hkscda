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

class FakeQuery {
  private filters: Array<{ column: string; value: unknown }> = [];
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
    this.filters.push({ column, value });
    return this;
  }

  or() {
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
});
