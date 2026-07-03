import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseCrmRepository } from "./repository.server";

const supporterId = "11111111-2222-4333-8444-555555555555";
const pledgeId = "44444444-5555-4333-8444-666666666666";

function supporterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: supporterId,
    name: "陳小姐",
    email: "chan@example.com",
    phone: "91234567",
    language: "zh-HK",
    tags: [],
    source: "donation_form",
    deleted_at: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

type FakeState = {
  supporterRows: Record<string, unknown>[];
  roleRows: Record<string, unknown>[];
  donationRows: Record<string, unknown>[];
  paymentRows: Record<string, unknown>[];
  receiptRows: Record<string, unknown>[];
  consentRows: Record<string, unknown>[];
  messageRows: Record<string, unknown>[];
  pledgeRows: Record<string, unknown>[];
  auditRows: Record<string, unknown>[];
};

class FakeQuery {
  private filters: Array<{ column: string; value: unknown; mode: "eq" | "in" }> = [];

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  select(_columns: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value, mode: "eq" });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, value: values, mode: "in" });
    return this;
  }

  order() {
    return this;
  }

  private rowsForTable(): Record<string, unknown>[] {
    switch (this.table) {
      case "supporter":
        return this.state.supporterRows;
      case "supporter_role":
        return this.state.roleRows;
      case "donation":
        return this.state.donationRows;
      case "payment":
        return this.state.paymentRows;
      case "receipt":
        return this.state.receiptRows;
      case "consent":
        return this.state.consentRows;
      case "message":
        return this.state.messageRows;
      case "sponsorship_pledge":
        return this.state.pledgeRows;
      case "audit_log":
        return this.state.auditRows;
      default:
        return [];
    }
  }

  private filteredRows() {
    return this.rowsForTable().filter((row) =>
      this.filters.every((filter) =>
        filter.mode === "in"
          ? (filter.value as unknown[]).includes(row[filter.column])
          : row[filter.column] === filter.value,
      ),
    );
  }

  async maybeSingle() {
    const rows = this.filteredRows();
    return { data: rows[0] ?? null, error: null };
  }

  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return Promise.resolve({ data: this.filteredRows(), error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

function createFakeClient(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    supporterRows: [supporterRow()],
    roleRows: [],
    donationRows: [],
    paymentRows: [],
    receiptRows: [],
    consentRows: [],
    messageRows: [],
    pledgeRows: [],
    auditRows: [],
    ...overrides,
  };

  const client = {
    from(table: string) {
      return new FakeQuery(state, table);
    },
  };

  return { client: client as unknown as SupabaseClient, state };
}

describe("getSupporterDetail", () => {
  test("returns null when the supporter does not exist", async () => {
    const { client } = createFakeClient({ supporterRows: [] });
    const repo = createSupabaseCrmRepository(client);

    expect(await repo.getSupporterDetail(supporterId)).toBeNull();
  });

  test("includes donation-entity audit rows in the timeline (existing behavior)", async () => {
    const donationId = "22222222-3333-4333-8444-555555555555";
    const { client } = createFakeClient({
      donationRows: [
        {
          id: donationId,
          supporter_id: supporterId,
          amount_cents: 10000,
          currency: "HKD",
          purpose: "general",
          status: "succeeded",
          method: "fps",
          receipt_requested: false,
          created_at: "2026-06-15T00:00:00.000Z",
        },
      ],
      auditRows: [
        {
          id: "audit-donation-1",
          actor_user_id: "actor-1",
          action: "donation.mark_received",
          entity: "donation",
          entity_id: donationId,
          timestamp: "2026-06-15T00:00:00.000Z",
          detail: {},
        },
      ],
    });
    const repo = createSupabaseCrmRepository(client);

    const detail = await repo.getSupporterDetail(supporterId);
    expect(detail?.auditLogs.some((row) => row.entityId === donationId)).toBe(true);
  });

  test("includes the supporter's sponsorship_pledge audit rows in the timeline", async () => {
    const { client } = createFakeClient({
      pledgeRows: [{ id: pledgeId, supporter_id: supporterId }],
      auditRows: [
        {
          id: "audit-pledge-1",
          actor_user_id: "actor-1",
          action: "sponsorship_pledge.cancelled",
          entity: "sponsorship_pledge",
          entity_id: pledgeId,
          timestamp: "2026-07-02T00:00:00.000Z",
          detail: {},
        },
      ],
    });
    const repo = createSupabaseCrmRepository(client);

    const detail = await repo.getSupporterDetail(supporterId);
    expect(detail?.auditLogs.some((row) => row.entityId === pledgeId)).toBe(true);
  });

  test("does not include audit rows for a pledge belonging to a different supporter", async () => {
    const otherPledgeId = "77777777-8888-4333-8444-999999999999";
    const { client } = createFakeClient({
      pledgeRows: [{ id: pledgeId, supporter_id: supporterId }],
      auditRows: [
        {
          id: "audit-pledge-other",
          actor_user_id: "actor-1",
          action: "sponsorship_pledge.cancelled",
          entity: "sponsorship_pledge",
          entity_id: otherPledgeId,
          timestamp: "2026-07-02T00:00:00.000Z",
          detail: {},
        },
      ],
    });
    const repo = createSupabaseCrmRepository(client);

    const detail = await repo.getSupporterDetail(supporterId);
    expect(detail?.auditLogs.some((row) => row.entityId === otherPledgeId)).toBe(false);
  });
});
