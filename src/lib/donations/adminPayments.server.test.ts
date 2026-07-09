import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listAdminPaymentExportRows, listAdminPaymentPage } from "./adminPayments.server";

type QueryCall = { table: string; method: string; payload?: unknown; options?: unknown };

class FakeQuery {
  private eqFilters: Array<{ column: string; value: unknown }> = [];
  private inFilters: Array<{ column: string; value: unknown[] }> = [];
  private overlapFilters: Array<{ column: string; value: unknown[] }> = [];
  private rangeBounds: { from: number; to: number } | null = null;
  private selectedOptions: { count?: string } | null = null;

  constructor(
    private readonly table: string,
    private readonly rows: Record<string, unknown>[],
    private readonly calls: QueryCall[],
  ) {}

  select(columns: string, options?: unknown) {
    this.calls.push({ table: this.table, method: "select", payload: columns, options });
    this.selectedOptions = (options as { count?: string } | undefined) ?? null;
    return this;
  }

  eq(column: string, value: unknown) {
    this.calls.push({ table: this.table, method: "eq", payload: { column, value } });
    this.eqFilters.push({ column, value });
    return this;
  }

  in(column: string, value: unknown) {
    this.calls.push({ table: this.table, method: "in", payload: { column, value } });
    this.inFilters.push({ column, value: value as unknown[] });
    return this;
  }

  or(filters: string) {
    this.calls.push({ table: this.table, method: "or", payload: filters });
    return this;
  }

  overlaps(column: string, value: unknown) {
    this.calls.push({ table: this.table, method: "overlaps", payload: { column, value } });
    this.overlapFilters.push({ column, value: value as unknown[] });
    return this;
  }

  order(column: string, options?: unknown) {
    this.calls.push({ table: this.table, method: "order", payload: column, options });
    return this;
  }

  range(from: number, to: number) {
    this.calls.push({ table: this.table, method: "range", payload: { from, to } });
    this.rangeBounds = { from, to };
    return this;
  }

  limit(count: number) {
    this.calls.push({ table: this.table, method: "limit", payload: count });
    this.rangeBounds = { from: 0, to: count - 1 };
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    let rows = this.rows.filter((row) =>
      this.eqFilters.every((filter) => row[filter.column] === filter.value),
    );
    rows = rows.filter((row) =>
      this.inFilters.every((filter) => filter.value.includes(row[filter.column])),
    );
    rows = rows.filter((row) =>
      this.overlapFilters.every((filter) => {
        const value = row[filter.column];
        return Array.isArray(value) && value.some((item) => filter.value.includes(item));
      }),
    );
    const count = rows.length;
    if (this.rangeBounds) rows = rows.slice(this.rangeBounds.from, this.rangeBounds.to + 1);
    return { data: rows, error: null, count: this.selectedOptions?.count ? count : null };
  }
}

function paymentRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    provider: "fps",
    provider_ref: `REF-${id}`,
    amount_cents: 10000,
    status: "pending",
    received_at: null,
    bank_reference: null,
    created_at: `2026-07-0${id.length}T00:00:00.000Z`,
    donation_id: `don-${id}`,
    donation: {
      id: `don-${id}`,
      purpose: "general",
      receipt_requested: true,
      status: "pending",
      supporter: {
        id: `sup-${id}`,
        name: `Supporter ${id}`,
        email: `${id}@example.test`,
        phone: null,
        language: "zh-HK",
      },
    },
    ...overrides,
  };
}

function createClient(rows: Record<string, unknown>[], receipts: Record<string, unknown>[] = []) {
  const calls: QueryCall[] = [];
  const client = {
    from(table: string) {
      calls.push({ table, method: "from" });
      const tableRows = table === "receipt" ? receipts : rows;
      return new FakeQuery(table, tableRows, calls);
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("listAdminPaymentPage", () => {
  test("returns a requested page, total count, and all-filter summary", async () => {
    const { client, calls } = createClient([
      paymentRow("a", { status: "pending", provider: "fps" }),
      paymentRow("b", {
        status: "succeeded",
        provider: "fps",
        amount_cents: 20000,
        donation_id: "don-b",
        donation: { ...paymentRow("b").donation, id: "don-b", status: "succeeded" },
      }),
      paymentRow("c", {
        status: "succeeded",
        provider: "fps",
        amount_cents: 30000,
        donation_id: "don-c",
        donation: {
          ...paymentRow("c").donation,
          id: "don-c",
          status: "succeeded",
          receipt_requested: false,
        },
      }),
    ]);

    const result = await listAdminPaymentPage(client, { provider: "fps", page: "2", pageSize: "1" });

    expect(result.payments.map((row) => row.id)).toEqual(["b"]);
    expect(result.total).toBe(3);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(1);
    expect(result.summary).toEqual({
      awaitingReconcile: 1,
      awaitingReceipt: 1,
      confirmedAmountCents: 50000,
    });
    expect(calls).toContainEqual({ table: "payment", method: "range", payload: { from: 1, to: 1 } });
  });
});

describe("listAdminPaymentExportRows", () => {
  test("returns every matching filtered row and ignores pagination input", async () => {
    const { client } = createClient([
      paymentRow("a", { status: "pending", provider: "fps" }),
      paymentRow("b", { status: "succeeded", provider: "stripe" }),
    ]);

    const rows = await listAdminPaymentExportRows(client, {
      provider: "fps",
      page: "99",
      pageSize: "1",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      paymentId: "a",
      provider: "fps",
      purpose: "general",
      status: "pending",
      amountCents: 10000,
    });
  });
});
