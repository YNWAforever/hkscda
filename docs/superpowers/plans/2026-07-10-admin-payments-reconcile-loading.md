# Admin Payments Reconcile Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin payments reconciliation table server-filtered and paginated while keeping summary cards and CSV export complete for the active filters.

**Architecture:** Move shared payment list types, schemas, query-string builders, and summary predicates into `src/lib/donations/adminPayments.ts`. Add a focused Supabase helper in `src/lib/donations/adminPayments.server.ts` that resolves search candidates, queries one table page, computes filter-wide summary totals, and maps export rows. Update the existing routes and `PaymentsReconcile` component to consume the new contract without changing reconciliation or receipt business rules.

**Tech Stack:** TanStack Start routes, React Query, Supabase JS v2, Zod, Bun test, existing admin `fetchAdminJson` helpers.

## Global Constraints

- Summary cards and CSV export cover all rows matching the active filters, not only the visible page.
- Table request filters are `status`, `provider`, `q`, `page`, and `pageSize`.
- Default page size is 25 and accepted server page size is 1 through 100.
- CSV export accepts the same filters except pagination.
- No database migration is added without live `EXPLAIN` evidence.
- Admin payment list access stays limited to staff, treasurer, and admin.
- CSV payment export access stays limited to treasurer and admin.

---

## File Structure

- Create `src/lib/donations/adminPayments.ts` for shared types, schemas, URL helpers, and payment summary predicates.
- Create `src/lib/donations/adminPayments.server.ts` for Supabase query helpers and CSV export row mapping.
- Create `src/lib/donations/adminPayments.server.test.ts` for query contract tests with a small fake Supabase client.
- Modify `src/components/admin/donations/paymentsReconcileLogic.ts` to keep UI labels/pills and re-export shared payment helpers from `src/lib/donations/adminPayments.ts`.
- Modify `src/components/admin/donations/paymentsReconcileLogic.test.ts` to add failing tests for query-string builders and keep current predicate coverage.
- Modify `src/routes/api/admin/payments.ts` to use `listAdminPaymentPage`.
- Modify `src/routes/api/admin/exports/payments[.]csv.ts` to use `listAdminPaymentExportRows` and pass filter params.
- Modify `src/components/admin/donations/PaymentsReconcile.tsx` to use query params, server summary, debounced search, and page controls.

---

### Task 1: Shared Payment Contract

**Files:**
- Create: `src/lib/donations/adminPayments.ts`
- Modify: `src/components/admin/donations/paymentsReconcileLogic.ts`
- Modify: `src/components/admin/donations/paymentsReconcileLogic.test.ts`

**Interfaces:**
- Consumes: `AdminRole` from `src/lib/admin/access.ts`.
- Produces:
  - `PAYMENT_RECONCILE_PAGE_SIZE: 25`
  - `adminPaymentSearchSchema`
  - `adminPaymentExportSearchSchema`
  - `buildPaymentSearchParams(input): URLSearchParams`
  - `buildPaymentExportSearchParams(input): URLSearchParams`
  - `AdminPaymentListResult`
  - existing payment predicate and summary exports.

- [ ] **Step 1: Write the failing tests**

Add these tests to `src/components/admin/donations/paymentsReconcileLogic.test.ts`:

```ts
import {
  buildPaymentExportSearchParams,
  buildPaymentSearchParams,
  adminPaymentSearchSchema,
} from "./paymentsReconcileLogic";

describe("payment search params", () => {
  test("builds stable list params with q mapped from search", () => {
    expect(
      buildPaymentSearchParams({
        search: "  Ada Wong  ",
        status: "succeeded",
        provider: "fps",
        page: 3,
        pageSize: 50,
      }).toString(),
    ).toBe("q=Ada+Wong&status=succeeded&provider=fps&page=3&pageSize=50");
  });

  test("always includes safe page defaults for the list request", () => {
    expect(buildPaymentSearchParams({ search: "", status: "all", provider: "all" }).toString()).toBe(
      "page=1&pageSize=25",
    );
  });

  test("builds export params without pagination", () => {
    expect(
      buildPaymentExportSearchParams({
        search: "REF-9",
        status: "pending",
        provider: "all",
      }).toString(),
    ).toBe("q=REF-9&status=pending");
  });

  test("server schema trims q and clamps unsafe pagination", () => {
    expect(adminPaymentSearchSchema.parse({ q: " Ada ", page: "0", pageSize: "500" })).toEqual({
      q: "Ada",
      status: "all",
      provider: "all",
      page: 1,
      pageSize: 25,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test src/components/admin/donations/paymentsReconcileLogic.test.ts
```

Expected: FAIL because `buildPaymentSearchParams`, `buildPaymentExportSearchParams`, and `adminPaymentSearchSchema` are not exported yet.

- [ ] **Step 3: Add the shared payment module and re-export it**

Create `src/lib/donations/adminPayments.ts` with this module:

```ts
import { z } from "zod";

import type { AdminRole } from "../admin/access";

export const PAYMENT_RECONCILE_PAGE_SIZE = 25;

export const paymentStatuses = ["pending", "succeeded", "failed", "refunded"] as const;
export const paymentProviders = ["stripe", "paypal", "fps", "payme", "manual"] as const;

export type PaymentStatus = (typeof paymentStatuses)[number];
export type PaymentProvider = (typeof paymentProviders)[number];

export type AdminPaymentRow = {
  id: string;
  provider: PaymentProvider;
  provider_ref: string | null;
  amount_cents: number;
  status: PaymentStatus;
  received_at: string | null;
  bank_reference: string | null;
  created_at: string;
  donation: {
    id: string;
    purpose: string;
    receipt_requested: boolean;
    status: PaymentStatus;
    supporter: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      language: "zh-HK" | "en";
    };
  };
};

export type AdminReceiptRow = {
  id: string;
  receipt_no: string;
  donation_ids: string[];
  status: "issued" | "void";
};

export type PaymentFilters = {
  status: PaymentStatus | "all";
  provider: PaymentProvider | "all";
  search: string;
};

export type AdminPaymentSearch = PaymentFilters & {
  q?: string;
  page: number;
  pageSize: number;
};

export type PaymentsSummary = {
  awaitingReconcile: number;
  awaitingReceipt: number;
  confirmedAmountCents: number;
};

export type AdminPaymentListResult = {
  payments: AdminPaymentRow[];
  receipts: AdminReceiptRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: PaymentsSummary;
};

export const MANUAL_PROVIDERS: PaymentProvider[] = ["fps", "payme", "manual"];

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

export const adminPaymentSearchSchema = z.object({
  q: optionalTrimmed,
  status: z.enum(["all", ...paymentStatuses]).catch("all"),
  provider: z.enum(["all", ...paymentProviders]).catch("all"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(PAYMENT_RECONCILE_PAGE_SIZE),
});

export const adminPaymentExportSearchSchema = adminPaymentSearchSchema.omit({
  page: true,
  pageSize: true,
});

function positiveInteger(value: number | null | undefined, fallback: number) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function setTrimmed(params: URLSearchParams, key: string, value?: string | null) {
  const trimmed = value?.trim();
  if (trimmed) params.set(key, trimmed);
}

export function buildPaymentSearchParams(
  input: Partial<PaymentFilters> & { page?: number | null; pageSize?: number | null },
) {
  const params = new URLSearchParams();
  setTrimmed(params, "q", input.search);
  if (input.status && input.status !== "all") params.set("status", input.status);
  if (input.provider && input.provider !== "all") params.set("provider", input.provider);
  params.set("page", String(positiveInteger(input.page, 1)));
  params.set("pageSize", String(positiveInteger(input.pageSize, PAYMENT_RECONCILE_PAGE_SIZE)));
  return params;
}

export function buildPaymentExportSearchParams(input: Partial<PaymentFilters>) {
  const params = new URLSearchParams();
  setTrimmed(params, "q", input.search);
  if (input.status && input.status !== "all") params.set("status", input.status);
  if (input.provider && input.provider !== "all") params.set("provider", input.provider);
  return params;
}

export function findIssuedReceipt(donationId: string, receipts: AdminReceiptRow[]) {
  return receipts.find((receipt) => receipt.status === "issued" && receipt.donation_ids.includes(donationId));
}

export function findVoidReceipt(donationId: string, receipts: AdminReceiptRow[]) {
  return receipts.find((receipt) => receipt.status === "void" && receipt.donation_ids.includes(donationId));
}

function canManageTreasurerActions(role?: AdminRole | null) {
  return role === undefined || role === "treasurer" || role === "admin";
}

export function canReconcile(payment: AdminPaymentRow, role?: AdminRole | null): boolean {
  return (
    canManageTreasurerActions(role) &&
    payment.status === "pending" &&
    MANUAL_PROVIDERS.includes(payment.provider)
  );
}

export function canIssueReceipt(
  payment: AdminPaymentRow,
  receipts: AdminReceiptRow[],
  role?: AdminRole | null,
): boolean {
  return (
    canManageTreasurerActions(role) &&
    payment.donation.status === "succeeded" &&
    payment.donation.receipt_requested &&
    !findIssuedReceipt(payment.donation.id, receipts)
  );
}

export function canVoidReceipt(
  payment: AdminPaymentRow,
  receipts: AdminReceiptRow[],
  role?: AdminRole | null,
): boolean {
  return canManageTreasurerActions(role) && Boolean(findIssuedReceipt(payment.donation.id, receipts));
}

export function summarizePayments(
  payments: AdminPaymentRow[],
  receipts: AdminReceiptRow[],
): PaymentsSummary {
  let awaitingReconcile = 0;
  let awaitingReceipt = 0;
  let confirmedAmountCents = 0;
  for (const payment of payments) {
    if (canReconcile(payment)) awaitingReconcile += 1;
    if (canIssueReceipt(payment, receipts)) awaitingReceipt += 1;
    if (payment.status === "succeeded") confirmedAmountCents += payment.amount_cents;
  }
  return { awaitingReconcile, awaitingReceipt, confirmedAmountCents };
}
```

Update `src/components/admin/donations/paymentsReconcileLogic.ts` so the duplicated types and predicate functions are imported or re-exported from `../../../lib/donations/adminPayments`, while keeping `PAYMENT_PILLS`, `paymentStatusPill`, `receiptPill`, and `financeActionLabel` in the component folder.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
bun test src/components/admin/donations/paymentsReconcileLogic.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/donations/adminPayments.ts src/components/admin/donations/paymentsReconcileLogic.ts src/components/admin/donations/paymentsReconcileLogic.test.ts
git commit -m "feat: add shared admin payment filters"
```

---

### Task 2: Server-Side Payment List And Export Helpers

**Files:**
- Create: `src/lib/donations/adminPayments.server.ts`
- Create: `src/lib/donations/adminPayments.server.test.ts`

**Interfaces:**
- Consumes: `adminPaymentSearchSchema`, `adminPaymentExportSearchSchema`, `summarizePayments`, and `AdminPaymentRow` from `src/lib/donations/adminPayments.ts`.
- Produces:
  - `listAdminPaymentPage(client: SupabaseClient, rawSearch: Record<string, string>): Promise<AdminPaymentListResult>`
  - `listAdminPaymentExportRows(client: SupabaseClient, rawSearch: Record<string, string>): Promise<PaymentExportRow[]>`

- [ ] **Step 1: Write the failing server helper tests**

Create `src/lib/donations/adminPayments.server.test.ts` with these test scenarios:

```ts
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
      paymentRow("b", { status: "succeeded", provider: "fps", amount_cents: 20000, donation_id: "don-b", donation: { ...paymentRow("b").donation, id: "don-b", status: "succeeded" } }),
      paymentRow("c", { status: "succeeded", provider: "fps", amount_cents: 30000, donation_id: "don-c", donation: { ...paymentRow("c").donation, id: "don-c", status: "succeeded", receipt_requested: false } }),
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test src/lib/donations/adminPayments.server.test.ts
```

Expected: FAIL because `src/lib/donations/adminPayments.server.ts` does not exist.

- [ ] **Step 3: Add the server helper**

Create `src/lib/donations/adminPayments.server.ts` with these exports:

```ts
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

function applyPaymentFilters<T extends { eq: (column: string, value: unknown) => T; in: (column: string, value: string[]) => T }>(
  query: T,
  filters: { status: string; provider: string },
  paymentIds?: string[],
) {
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

async function resolveSearchPaymentIds(client: SupabaseClient, q?: string) {
  const trimmed = q?.trim();
  if (!trimmed) return undefined;
  const escaped = trimmed.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
  const pattern = `%${escaped}%`;

  const [{ data: paymentRows, error: paymentError }, { data: supporterRows, error: supporterError }] =
    await Promise.all([
      client.from("payment").select("id").or(`provider_ref.ilike.${pattern},bank_reference.ilike.${pattern}`),
      client.from("supporter").select("id").or(`name.ilike.${pattern},email.ilike.${pattern}`),
    ]);
  if (paymentError) throw paymentError;
  if (supporterError) throw supporterError;

  const ids = new Set<string>((paymentRows ?? []).map((row) => String(row.id)));
  const supporterIds = (supporterRows ?? []).map((row) => String(row.id));
  if (supporterIds.length > 0) {
    const { data: donationRows, error: donationError } = await client
      .from("donation")
      .select("id")
      .in("supporter_id", supporterIds);
    if (donationError) throw donationError;
    const donationIds = (donationRows ?? []).map((row) => String(row.id));
    if (donationIds.length > 0) {
      const { data: linkedPayments, error: linkedPaymentError } = await client
        .from("payment")
        .select("id")
        .in("donation_id", donationIds);
      if (linkedPaymentError) throw linkedPaymentError;
      for (const row of linkedPayments ?? []) ids.add(String(row.id));
    }
  }
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
  const result = await selectPaymentRows(client, { ...filters, page: 1, pageSize: 100 }, { paymentIds });
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
```

- [ ] **Step 4: Run the helper tests**

Run:

```bash
bun test src/lib/donations/adminPayments.server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/donations/adminPayments.server.ts src/lib/donations/adminPayments.server.test.ts
git commit -m "feat: add admin payment server queries"
```

---

### Task 3: Routes Use Filtered Helpers

**Files:**
- Modify: `src/routes/api/admin/payments.ts`
- Modify: `src/routes/api/admin/exports/payments[.]csv.ts`

**Interfaces:**
- Consumes: `listAdminPaymentPage` and `listAdminPaymentExportRows` from `src/lib/donations/adminPayments.server.ts`.
- Produces: `/api/admin/payments` JSON response with `{ payments, receipts, total, page, pageSize, summary }`; `/api/admin/exports/payments.csv` filtered CSV.

- [ ] **Step 1: Write failing route-facing expectations**

Add this assertion to the server helper test file so route wiring has a response contract target:

```ts
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
```

- [ ] **Step 2: Run the route-facing test**

Run:

```bash
bun test src/lib/donations/adminPayments.server.test.ts
```

Expected: PASS once Task 2 is complete; this locks the route response shape before touching route files.

- [ ] **Step 3: Update `/api/admin/payments`**

Replace the route body with:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { listAdminPaymentPage } from "../../../lib/donations/adminPayments.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../lib/donations/supabase.server";

function searchRecord(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

export const Route = createFileRoute("/api/admin/payments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          await requireAdmin(request, ["staff", "treasurer", "admin"], client);
          const result = await listAdminPaymentPage(client, searchRecord(request));
          return Response.json(result, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          if (error instanceof Response) return error;
          console.error(error);
          return Response.json({ error: "Could not load payments" }, { status: 500 });
        }
      },
    },
  },
});
```

- [ ] **Step 4: Update `/api/admin/exports/payments.csv`**

Replace the list/export logic with:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { buildPaymentCsv } from "../../../../lib/crm/csv";
import { listAdminPaymentExportRows } from "../../../../lib/donations/adminPayments.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

function searchRecord(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

export const Route = createFileRoute("/api/admin/exports/payments.csv")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          await requireAdmin(request, ["treasurer", "admin"], client);
          const rows = await listAdminPaymentExportRows(client, searchRecord(request));
          const csv = buildPaymentCsv(rows);
          return new Response(csv, {
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-disposition": 'attachment; filename="payments.csv"',
            },
          });
        } catch (error) {
          if (error instanceof Response) return error;
          console.error(error);
          return Response.json({ error: "Could not export payments" }, { status: 500 });
        }
      },
    },
  },
});
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
bun test src/lib/donations/adminPayments.server.test.ts src/components/admin/donations/paymentsReconcileLogic.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/routes/api/admin/payments.ts "src/routes/api/admin/exports/payments[.]csv.ts" src/lib/donations/adminPayments.server.test.ts
git commit -m "feat: route payment filters through server helpers"
```

---

### Task 4: PaymentsReconcile Uses Server Pagination

**Files:**
- Modify: `src/components/admin/donations/PaymentsReconcile.tsx`

**Interfaces:**
- Consumes: `AdminPaymentListResult`, `PAYMENT_RECONCILE_PAGE_SIZE`, `buildPaymentSearchParams`, and `buildPaymentExportSearchParams` from `paymentsReconcileLogic.ts`.
- Produces: server-backed payment table, debounced search, page controls, and filtered export URL.

- [ ] **Step 1: Write the client contract tests**

Add this test to `src/components/admin/donations/paymentsReconcileLogic.test.ts`:

```ts
test("export params use the same active filters as the list without page values", () => {
  const listParams = buildPaymentSearchParams({
    search: "Ada",
    status: "succeeded",
    provider: "stripe",
    page: 4,
    pageSize: 25,
  });
  const exportParams = buildPaymentExportSearchParams({
    search: "Ada",
    status: "succeeded",
    provider: "stripe",
  });

  expect(listParams.toString()).toBe("q=Ada&status=succeeded&provider=stripe&page=4&pageSize=25");
  expect(exportParams.toString()).toBe("q=Ada&status=succeeded&provider=stripe");
});
```

- [ ] **Step 2: Run the client contract test**

Run:

```bash
bun test src/components/admin/donations/paymentsReconcileLogic.test.ts
```

Expected: PASS once Task 1 is complete.

- [ ] **Step 3: Update the React Query list request**

In `src/components/admin/donations/PaymentsReconcile.tsx`, import `keepPreviousData` and the new helpers:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, FileCheck, FileX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
```

Add these imports from `paymentsReconcileLogic`:

```ts
  buildPaymentExportSearchParams,
  buildPaymentSearchParams,
  PAYMENT_RECONCILE_PAGE_SIZE,
  type AdminPaymentListResult,
```

Replace the local query state and list query with:

```ts
  const [filters, setFilters] = useState<PaymentFilters>({
    status: "all",
    provider: "all",
    search: "",
  });
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(filters.search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [filters.search]);

  const paymentSearch = useMemo(
    () =>
      buildPaymentSearchParams({
        ...filters,
        search: debouncedSearch,
        page,
        pageSize: PAYMENT_RECONCILE_PAGE_SIZE,
      }).toString(),
    [debouncedSearch, filters, page],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-payments", paymentSearch],
    queryFn: () => fetchAdminJson<AdminPaymentListResult>(`/api/admin/payments?${paymentSearch}`),
    placeholderData: keepPreviousData,
  });
```

Replace `payments`, `receipts`, `visible`, and `summary` setup with:

```ts
  const payments = data?.payments ?? [];
  const receipts = data?.receipts ?? [];
  const summary = data?.summary ?? {
    awaitingReconcile: 0,
    awaitingReceipt: 0,
    confirmedAmountCents: 0,
  };
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAYMENT_RECONCILE_PAGE_SIZE));
  const pageStart = total === 0 ? 0 : (page - 1) * PAYMENT_RECONCILE_PAGE_SIZE + 1;
  const pageEnd = Math.min(total, page * PAYMENT_RECONCILE_PAGE_SIZE);
```

Add:

```ts
  function updateFilters(patch: Partial<PaymentFilters>) {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  }
```

- [ ] **Step 4: Update export and controls**

In `handleExport`, build the filtered URL:

```ts
      const exportParams = buildPaymentExportSearchParams({
        ...filters,
        search: debouncedSearch,
      }).toString();
      const exportUrl = exportParams
        ? `/api/admin/exports/payments.csv?${exportParams}`
        : "/api/admin/exports/payments.csv";
      const response = await fetch(exportUrl, {
        headers: { authorization: `Bearer ${token}` },
      });
```

Use `updateFilters` in search/status/provider changes:

```tsx
onChange={(event) => updateFilters({ search: event.target.value })}
onValueChange={(value) => updateFilters({ status: value as PaymentFilters["status"] })}
onValueChange={(value) => updateFilters({ provider: value as PaymentFilters["provider"] })}
```

Pass the server rows into the table:

```tsx
rows={payments}
loading={isLoading || isFetching}
```

Add page controls immediately below `DataTable`:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text-muted)]">
        <span>
          {pageStart}-{pageEnd} / {total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || isFetching}
            aria-label="Previous payments page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || isFetching}
            aria-label="Next payments page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
bun test src/components/admin/donations/paymentsReconcileLogic.test.ts src/lib/donations/adminPayments.server.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/components/admin/donations/PaymentsReconcile.tsx src/components/admin/donations/paymentsReconcileLogic.test.ts
git commit -m "feat: paginate admin payment reconciliation"
```

---

### Task 5: Final Verification

**Files:**
- Read: `git status --short`
- Read: touched source and test files only when a verification failure points to them.

**Interfaces:**
- Consumes: commits from Tasks 1 through 4.
- Produces: verified branch with no new failures in focused tests and build.

- [ ] **Step 1: Run focused payment tests**

Run:

```bash
bun test src/components/admin/donations/paymentsReconcileLogic.test.ts src/lib/donations/adminPayments.server.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the broader admin performance suite**

Run:

```bash
bun test src/lib/adoptions/schemas.test.ts src/components/admin/adoptions/animalPipelineLogic.test.ts src/lib/adoptions/service.test.ts src/lib/adoptions/http.test.ts src/lib/adoptions/repository.server.test.ts src/components/admin/donations/paymentsReconcileLogic.test.ts src/lib/donations/adminPayments.server.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
bun run build
```

Expected: exit code 0. Known route export warnings can be reported separately if they match existing baseline warnings.

- [ ] **Step 4: Run changed-file lint**

Run:

```bash
bunx eslint src/lib/donations/adminPayments.ts src/lib/donations/adminPayments.server.ts src/lib/donations/adminPayments.server.test.ts src/components/admin/donations/paymentsReconcileLogic.ts src/components/admin/donations/paymentsReconcileLogic.test.ts src/components/admin/donations/PaymentsReconcile.tsx src/routes/api/admin/payments.ts "src/routes/api/admin/exports/payments[.]csv.ts" --rule "prettier/prettier: off"
```

Expected: PASS. Repo-wide lint may still fail on existing formatting debt; report that separately.

- [ ] **Step 5: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no whitespace errors. Windows LF-to-CRLF warnings are acceptable if they match the repo baseline.

- [ ] **Step 6: Commit verification notes if only docs changed during verification**

If verification causes no source edits, do not create a new commit. If a small source fix is needed, commit the exact fixed files:

```bash
git add <fixed-files>
git commit -m "fix: stabilize admin payment loading"
```

---

## Plan Self-Review

- Spec coverage: server pagination, all-filter summaries, filtered CSV export, permission boundaries, and no speculative indexes are covered by Tasks 1 through 5.
- No incomplete markers remain.
- Type consistency: `AdminPaymentListResult`, `PaymentFilters`, `PaymentsSummary`, and URL helper names match across all tasks.
- Scope is limited to payments reconciliation loading and export behavior.
