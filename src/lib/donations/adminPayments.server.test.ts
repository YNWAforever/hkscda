import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listAdminPaymentExportRows, listAdminPaymentPage } from "./adminPayments.server";

type QueryCall = { table: string; method: string; payload?: unknown; options?: unknown };

class FakeQuery {
  private eqFilters: Array<{ column: string; value: unknown }> = [];
  private inFilters: Array<{ column: string; value: unknown[] }> = [];
  private overlapFilters: Array<{ column: string; value: unknown[] }> = [];
  private orderings: Array<{ column: string; ascending: boolean }> = [];
  private rangeBounds: { from: number; to: number } | null = null;
  private selectedOptions: { count?: string } | null = null;

  constructor(
    private readonly table: string,
    private readonly rows: Record<string, unknown>[],
    private readonly calls: QueryCall[],
    private readonly serverRowCap: number,
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
    this.orderings.push({
      column,
      ascending: (options as { ascending?: boolean } | undefined)?.ascending ?? true,
    });
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
    rows = [...rows].sort((left, right) => {
      for (const ordering of this.orderings) {
        const leftValue = left[ordering.column];
        const rightValue = right[ordering.column];
        if (leftValue === rightValue) continue;
        const comparison = String(leftValue).localeCompare(String(rightValue));
        return ordering.ascending ? comparison : -comparison;
      }
      return 0;
    });
    const count = rows.length;
    if (this.rangeBounds) rows = rows.slice(this.rangeBounds.from, this.rangeBounds.to + 1);
    rows = rows.slice(0, this.serverRowCap);
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
      custom_purpose: "個案 A",
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

function createClient(
  rows: Record<string, unknown>[],
  receipts: Record<string, unknown>[] = [],
  options: {
    serverRowCap?: number;
    tableRows?: Record<string, Record<string, unknown>[]>;
  } = {},
) {
  const calls: QueryCall[] = [];
  const client = {
    from(table: string) {
      calls.push({ table, method: "from" });
      const tableRows =
        options.tableRows?.[table] ??
        (table === "payment" ? rows : table === "receipt" ? receipts : []);
      return new FakeQuery(
        table,
        tableRows,
        calls,
        options.serverRowCap ?? Number.POSITIVE_INFINITY,
      );
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("listAdminPaymentPage", () => {
  test("list response shape is stable for the payments route", async () => {
    const { client } = createClient([paymentRow("a")]);

    const result = await listAdminPaymentPage(client, {});

    expect(Object.keys(result).sort()).toEqual([
      "page",
      "pageSize",
      "payments",
      "receipts",
      "summary",
      "total",
    ]);
  });

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

    const result = await listAdminPaymentPage(client, {
      provider: "fps",
      page: "2",
      pageSize: "1",
    });

    expect(result.payments.map((row) => row.id)).toEqual(["b"]);
    expect(result.total).toBe(3);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(1);
    expect(result.summary).toEqual({
      awaitingReconcile: 1,
      awaitingReceipt: 1,
      confirmedAmountCents: 50000,
    });
    expect(
      calls.filter((call) => call.table === "payment" && call.method === "range"),
    ).toContainEqual({ table: "payment", method: "range", payload: { from: 1, to: 1 } });
    expect(
      calls
        .filter((call) => call.table === "payment" && call.method === "select")
        .map((call) => call.payload),
    ).toContain(
      "id,provider,amount_cents,status,donation:donation_id(id,receipt_requested,status)",
    );
  });

  test("reads the complete filter-wide summary when the server caps each response", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) =>
      paymentRow(`p-${String(index).padStart(4, "0")}`, {
        status: "succeeded",
        amount_cents: 100,
        donation: {
          ...paymentRow(`p-${index}`).donation,
          id: `don-p-${String(index).padStart(4, "0")}`,
          status: "succeeded",
          receipt_requested: false,
        },
      }),
    );
    const { client } = createClient(rows, [], { serverRowCap: 250 });

    const result = await listAdminPaymentPage(client, { page: "1", pageSize: "25" });

    expect(result.total).toBe(1001);
    expect(result.summary.confirmedAmountCents).toBe(100100);
  });

  test("loads receipts for page donations beyond the first capped receipt response", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => {
      const id = `p-${String(index).padStart(4, "0")}`;
      return paymentRow(id, {
        created_at: "2026-07-10T00:00:00.000Z",
        status: "succeeded",
        donation: {
          ...paymentRow(id).donation,
          id: `don-${id}`,
          status: "succeeded",
        },
      });
    });
    const receipts = rows.map((row) => ({
      id: `receipt-${row.id}`,
      receipt_no: `R-${row.id}`,
      donation_ids: [`don-${row.id}`],
      status: "issued",
    }));
    const { client } = createClient(rows, receipts, { serverRowCap: 250 });

    const result = await listAdminPaymentPage(client, { page: "41", pageSize: "25" });

    expect(result.payments).toHaveLength(1);
    expect(result.receipts.map((receipt) => receipt.donation_ids[0])).toEqual([
      result.payments[0]?.donation.id,
    ]);
    expect(result.summary.awaitingReceipt).toBe(0);
  });

  test("uses id descending to break ties in created_at pagination", async () => {
    const createdAt = "2026-07-10T12:00:00.000Z";
    const { client } = createClient([
      paymentRow("a", { created_at: createdAt }),
      paymentRow("c", { created_at: createdAt }),
      paymentRow("b", { created_at: createdAt }),
    ]);

    const result = await listAdminPaymentPage(client, { page: "1", pageSize: "2" });

    expect(result.payments.map((payment) => payment.id)).toEqual(["c", "b"]);
  });

  test("sanitizes grammar-sensitive q input before building .or filters", async () => {
    const { client, calls } = createClient([]);

    await listAdminPaymentPage(client, {
      q: "a,b(vip)",
      provider: "all",
      page: "1",
      pageSize: "10",
    });

    expect(calls.filter((call) => call.method === "or").map((call) => call.payload)).toEqual([
      "provider_ref.ilike.%a%b%vip%,bank_reference.ilike.%a%b%vip%",
      "name.ilike.%a%b%vip%,email.ilike.%a%b%vip%",
    ]);
  });

  test("keeps punctuation-heavy matches after fallback filtering", async () => {
    const { client } = createClient([
      paymentRow("vip", {
        provider_ref: "a,b(vip)",
        bank_reference: null,
      }),
    ]);

    const result = await listAdminPaymentPage(client, {
      q: "a,b(vip)",
      provider: "all",
      page: "1",
      pageSize: "10",
    });

    expect(result.payments.map((row) => row.id)).toEqual(["vip"]);
  });

  test("finds a search candidate beyond the first server-capped response", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) =>
      paymentRow(`p-${String(index).padStart(4, "0")}`, {
        provider_ref: index === 1000 ? "FINAL-NEEDLE" : `REF-${index}`,
      }),
    );
    const { client } = createClient(rows, [], { serverRowCap: 250 });

    const result = await listAdminPaymentPage(client, {
      q: "FINAL-NEEDLE",
      page: "1",
      pageSize: "25",
    });

    expect(result.payments.map((payment) => payment.id)).toEqual(["p-1000"]);
  });

  test("chunks large search and receipt ID filters while preserving every match", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) =>
      paymentRow(`p-${String(index).padStart(4, "0")}`, { provider_ref: `NEEDLE-${index}` }),
    );
    const { client, calls } = createClient(rows, [], { serverRowCap: 250 });

    const result = await listAdminPaymentPage(client, {
      q: "NEEDLE",
      page: "1",
      pageSize: "25",
    });

    expect(result.total).toBe(1001);
    const arrayFilters = calls.filter((call) => call.method === "in" || call.method === "overlaps");
    expect(arrayFilters.length).toBeGreaterThan(1);
    expect(
      arrayFilters.every(
        (call) =>
          Array.isArray((call.payload as { value?: unknown[] }).value) &&
          (call.payload as { value: unknown[] }).value.length <= 200,
      ),
    ).toBe(true);
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
      customPurpose: "個案 A",
      status: "pending",
      amountCents: 10000,
    });
  });

  test("exports every matching row when the server caps each response", async () => {
    const payments = Array.from({ length: 1001 }, (_, index) =>
      paymentRow(`p-${String(index).padStart(4, "0")}`),
    );
    const { client } = createClient(payments, [], { serverRowCap: 250 });

    const rows = await listAdminPaymentExportRows(client, {});

    expect(rows).toHaveLength(1001);
    expect(new Set(rows.map((row) => row.paymentId)).size).toBe(1001);
  });
});
