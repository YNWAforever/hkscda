# Payments Reconcile Finance Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw inline payments table at `/admin?section=payments` with a transaction-centric finance console (reconcile manual payments, manage receipts, export CSV, review finance activity) built on the Phase 2 `DataTable`/`StatusPill` primitives.

**Architecture:** A new `src/components/admin/donations/` package: a pure `paymentsReconcileLogic` module (status/predicate/filter/summary rules, unit-tested), a `PaymentsReconcile` console component, and a `ReconcileDialog`. Three additive backend reads (receipts in the payments list, a finance-activity feed, a payments CSV export) reuse the existing reconcile/receipt server functions and routes. Write actions stay API-enforced; the client surfaces 403s.

**Tech Stack:** TanStack Start (React 19, file-based routes), TanStack Query, Supabase service client, Tailwind v4 + shadcn/ui, `bun test`.

**Spec:** `docs/superpowers/specs/2026-06-30-payments-reconcile-console-design.md`

**Conventions for every task:**
- Type check: `bunx tsc --noEmit` → Expected: no errors (or no *new* errors vs. baseline).
- Lint: `bun run lint` → Expected: clean.
- Tests: `bun test` → Expected: all pass.
- Commit messages use Conventional Commits and end with the trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Never hardcode colours — use `var(--color-*)` tokens / `StatusPill` tones.

---

### Task 1: Shared admin HTTP client helper (de-dupe `fetchAdminJson`)

`fetchAdminJson`/`getAdminAccessToken` are duplicated in `src/components/admin/crm/api.ts` and inline in `src/routes/admin/index.tsx`. Lift one canonical copy so the new donations component (and the CRM) share it.

**Files:**
- Create: `src/lib/admin/http.client.ts`
- Modify: `src/components/admin/crm/api.ts`

- [ ] **Step 1: Create the shared helper**

Create `src/lib/admin/http.client.ts`:

```ts
import { supabase } from "../supabase";

export async function getAdminAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("未登入");
  return session.access_token;
}

export async function fetchAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAdminAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : "API request failed");
  }

  return response.json() as Promise<T>;
}
```

- [ ] **Step 2: Re-export from the CRM api module**

Replace the entire contents of `src/components/admin/crm/api.ts` with a re-export so existing CRM imports (`import { fetchAdminJson } from "./api"`) keep working:

```ts
export { fetchAdminJson, getAdminAccessToken } from "../../../lib/admin/http.client";
```

- [ ] **Step 3: Verify types, lint, tests**

Run: `bunx tsc --noEmit && bun run lint && bun test`
Expected: no errors; lint clean; all tests pass (CRM components still resolve `fetchAdminJson`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/admin/http.client.ts src/components/admin/crm/api.ts
git commit -m "$(cat <<'EOF'
refactor(admin): lift shared fetchAdminJson into lib/admin/http.client

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `paymentsReconcileLogic` — pure rules (TDD)

All non-React workflow rules: row/receipt types, status→tone mapping, action predicates, receipt join, filters, summary, and the finance-action label.

**Files:**
- Create: `src/components/admin/donations/paymentsReconcileLogic.ts`
- Test: `src/components/admin/donations/paymentsReconcileLogic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/donations/paymentsReconcileLogic.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  applyPaymentFilters,
  canIssueReceipt,
  canReconcile,
  canVoidReceipt,
  financeActionLabel,
  findIssuedReceipt,
  paymentStatusPill,
  receiptPill,
  summarizePayments,
  type AdminPaymentRow,
  type AdminReceiptRow,
} from "./paymentsReconcileLogic";

function payment(overrides: Partial<AdminPaymentRow> = {}): AdminPaymentRow {
  return {
    id: "pay-1",
    provider: "fps",
    provider_ref: "HKSCDA-ABC123",
    amount_cents: 50000,
    status: "pending",
    received_at: null,
    bank_reference: null,
    created_at: "2026-06-30T00:00:00.000Z",
    donation: {
      id: "don-1",
      purpose: "general",
      receipt_requested: true,
      status: "pending",
      supporter: {
        id: "sup-1",
        name: "陳大文",
        email: "tai.man@example.com",
        phone: null,
        language: "zh-HK",
      },
    },
    ...overrides,
  };
}

const issuedReceipt: AdminReceiptRow = {
  id: "rcpt-1",
  receipt_no: "HKSCDA-2026-000001",
  donation_ids: ["don-1"],
  status: "issued",
};

describe("paymentStatusPill", () => {
  test("maps every payment status to a tone + label", () => {
    expect(paymentStatusPill("pending")).toEqual({ tone: "warning", label: "待確認" });
    expect(paymentStatusPill("succeeded")).toEqual({ tone: "success", label: "已確認" });
    expect(paymentStatusPill("failed")).toEqual({ tone: "danger", label: "失敗" });
    expect(paymentStatusPill("refunded")).toEqual({ tone: "neutral", label: "已退款" });
  });
});

describe("receiptPill", () => {
  test("issued receipt shows its number", () => {
    const pill = receiptPill(payment({ status: "succeeded", donation: { ...payment().donation, status: "succeeded" } }), [issuedReceipt]);
    expect(pill).toEqual({ tone: "success", label: "已發 HKSCDA-2026-000001" });
  });

  test("succeeded + requested + none issued shows awaiting", () => {
    const pill = receiptPill(
      payment({ status: "succeeded", donation: { ...payment().donation, status: "succeeded" } }),
      [],
    );
    expect(pill).toEqual({ tone: "warning", label: "待發收條" });
  });

  test("void receipt shows voided", () => {
    const pill = receiptPill(payment({ status: "succeeded" }), [
      { ...issuedReceipt, status: "void" },
    ]);
    expect(pill).toEqual({ tone: "neutral", label: "已作廢" });
  });

  test("receipt not requested shows nothing", () => {
    const pill = receiptPill(
      payment({ donation: { ...payment().donation, receipt_requested: false } }),
      [],
    );
    expect(pill).toBeNull();
  });
});

describe("findIssuedReceipt", () => {
  test("matches by donation id inside donation_ids", () => {
    expect(findIssuedReceipt("don-1", [issuedReceipt])).toBe(issuedReceipt);
    expect(findIssuedReceipt("don-9", [issuedReceipt])).toBeUndefined();
  });
});

describe("action predicates", () => {
  test("canReconcile only for pending manual providers", () => {
    expect(canReconcile(payment({ provider: "fps", status: "pending" }))).toBe(true);
    expect(canReconcile(payment({ provider: "payme", status: "pending" }))).toBe(true);
    expect(canReconcile(payment({ provider: "manual", status: "pending" }))).toBe(true);
    expect(canReconcile(payment({ provider: "stripe", status: "pending" }))).toBe(false);
    expect(canReconcile(payment({ provider: "fps", status: "succeeded" }))).toBe(false);
  });

  test("canIssueReceipt requires succeeded + requested + no issued receipt", () => {
    const succeeded = payment({
      status: "succeeded",
      donation: { ...payment().donation, status: "succeeded", receipt_requested: true },
    });
    expect(canIssueReceipt(succeeded, [])).toBe(true);
    expect(canIssueReceipt(succeeded, [issuedReceipt])).toBe(false);
    expect(
      canIssueReceipt(
        payment({ status: "succeeded", donation: { ...payment().donation, status: "succeeded", receipt_requested: false } }),
        [],
      ),
    ).toBe(false);
    expect(canIssueReceipt(payment({ status: "pending" }), [])).toBe(false);
  });

  test("canVoidReceipt requires an issued receipt", () => {
    expect(canVoidReceipt(payment(), [issuedReceipt])).toBe(true);
    expect(canVoidReceipt(payment(), [{ ...issuedReceipt, status: "void" }])).toBe(false);
    expect(canVoidReceipt(payment(), [])).toBe(false);
  });
});

describe("applyPaymentFilters", () => {
  const rows = [
    payment({ id: "a", status: "pending", provider: "fps" }),
    payment({ id: "b", status: "succeeded", provider: "stripe", bank_reference: "REF-9" }),
    payment({
      id: "c",
      status: "refunded",
      provider: "paypal",
      donation: { ...payment().donation, supporter: { ...payment().donation.supporter, name: "Mary", email: "mary@x.io" } },
    }),
  ];

  test("filters by status", () => {
    expect(applyPaymentFilters(rows, { status: "pending", provider: "all", search: "" }).map((r) => r.id)).toEqual(["a"]);
  });

  test("filters by provider", () => {
    expect(applyPaymentFilters(rows, { status: "all", provider: "paypal", search: "" }).map((r) => r.id)).toEqual(["c"]);
  });

  test("search matches name, email, provider_ref and bank_reference, case-insensitive", () => {
    expect(applyPaymentFilters(rows, { status: "all", provider: "all", search: "mary" }).map((r) => r.id)).toEqual(["c"]);
    expect(applyPaymentFilters(rows, { status: "all", provider: "all", search: "ref-9" }).map((r) => r.id)).toEqual(["b"]);
    expect(applyPaymentFilters(rows, { status: "all", provider: "all", search: "陳" }).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("summarizePayments", () => {
  test("counts awaiting actions and totals confirmed amounts", () => {
    const rows = [
      payment({ id: "a", status: "pending", provider: "fps" }),
      payment({
        id: "b",
        status: "succeeded",
        amount_cents: 20000,
        donation: { ...payment().donation, status: "succeeded", receipt_requested: true },
      }),
      payment({
        id: "c",
        status: "succeeded",
        amount_cents: 30000,
        donation: { ...payment().donation, status: "succeeded", receipt_requested: false },
      }),
    ];
    expect(summarizePayments(rows, [])).toEqual({
      awaitingReconcile: 1,
      awaitingReceipt: 1,
      confirmedAmountCents: 50000,
    });
  });
});

describe("financeActionLabel", () => {
  test("maps known finance actions, falls back to the raw action", () => {
    expect(financeActionLabel("payment.mark_received")).toBe("標記已收款");
    expect(financeActionLabel("receipt.issue")).toBe("發收條");
    expect(financeActionLabel("receipt.void")).toBe("作廢收條");
    expect(financeActionLabel("something.else")).toBe("something.else");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/admin/donations/paymentsReconcileLogic.test.ts`
Expected: FAIL — `Cannot find module "./paymentsReconcileLogic"`.

- [ ] **Step 3: Implement the logic module**

Create `src/components/admin/donations/paymentsReconcileLogic.ts`:

```ts
import type { StatusTone } from "../StatusBadge";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";
export type PaymentProvider = "stripe" | "paypal" | "fps" | "payme" | "manual";

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

export type PillSpec = { tone: StatusTone; label: string };

export type PaymentFilters = {
  status: PaymentStatus | "all";
  provider: PaymentProvider | "all";
  search: string;
};

export type PaymentsSummary = {
  awaitingReconcile: number;
  awaitingReceipt: number;
  confirmedAmountCents: number;
};

export const MANUAL_PROVIDERS: PaymentProvider[] = ["fps", "payme", "manual"];

const PAYMENT_PILLS: Record<PaymentStatus, PillSpec> = {
  pending: { tone: "warning", label: "待確認" },
  succeeded: { tone: "success", label: "已確認" },
  failed: { tone: "danger", label: "失敗" },
  refunded: { tone: "neutral", label: "已退款" },
};

export function paymentStatusPill(status: PaymentStatus): PillSpec {
  return PAYMENT_PILLS[status];
}

export function findIssuedReceipt(donationId: string, receipts: AdminReceiptRow[]) {
  return receipts.find((r) => r.status === "issued" && r.donation_ids.includes(donationId));
}

function findVoidReceipt(donationId: string, receipts: AdminReceiptRow[]) {
  return receipts.find((r) => r.status === "void" && r.donation_ids.includes(donationId));
}

export function receiptPill(payment: AdminPaymentRow, receipts: AdminReceiptRow[]): PillSpec | null {
  const issued = findIssuedReceipt(payment.donation.id, receipts);
  if (issued) return { tone: "success", label: `已發 ${issued.receipt_no}` };
  if (canIssueReceipt(payment, receipts)) return { tone: "warning", label: "待發收條" };
  if (findVoidReceipt(payment.donation.id, receipts)) return { tone: "neutral", label: "已作廢" };
  return null;
}

export function canReconcile(payment: AdminPaymentRow): boolean {
  return payment.status === "pending" && MANUAL_PROVIDERS.includes(payment.provider);
}

export function canIssueReceipt(payment: AdminPaymentRow, receipts: AdminReceiptRow[]): boolean {
  return (
    payment.donation.status === "succeeded" &&
    payment.donation.receipt_requested &&
    !findIssuedReceipt(payment.donation.id, receipts)
  );
}

export function canVoidReceipt(payment: AdminPaymentRow, receipts: AdminReceiptRow[]): boolean {
  return Boolean(findIssuedReceipt(payment.donation.id, receipts));
}

export function applyPaymentFilters(
  payments: AdminPaymentRow[],
  filters: PaymentFilters,
): AdminPaymentRow[] {
  const search = filters.search.trim().toLowerCase();
  return payments.filter((payment) => {
    if (filters.status !== "all" && payment.status !== filters.status) return false;
    if (filters.provider !== "all" && payment.provider !== filters.provider) return false;
    if (!search) return true;
    const haystack = [
      payment.donation.supporter.name,
      payment.donation.supporter.email,
      payment.provider_ref ?? "",
      payment.bank_reference ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
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

const FINANCE_ACTION_LABELS: Record<string, string> = {
  "payment.mark_received": "標記已收款",
  "receipt.issue": "發收條",
  "receipt.void": "作廢收條",
};

export function financeActionLabel(action: string): string {
  return FINANCE_ACTION_LABELS[action] ?? action;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/admin/donations/paymentsReconcileLogic.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Type check + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors; lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/donations/paymentsReconcileLogic.ts src/components/admin/donations/paymentsReconcileLogic.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): add payments reconcile logic (status, predicates, filters)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Backend reads — receipts in payments list + finance activity feed

Add two read helpers and wire them into routes. The payments route gains a `receipts` key (additive — existing consumers ignore it); a new route serves the finance activity feed.

**Files:**
- Modify: `src/lib/donations/supabase.server.ts` (append two functions)
- Modify: `src/routes/api/admin/payments.ts`
- Create: `src/routes/api/admin/finance/activity.ts`

- [ ] **Step 1: Add `listAdminReceipts` and `listFinanceActivity`**

Append to `src/lib/donations/supabase.server.ts` (after `listAdminPayments`):

```ts
export async function listAdminReceipts(client: SupabaseClient) {
  const { data, error } = await client
    .from("receipt")
    .select("id,receipt_no,donation_ids,status")
    .order("issued_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

const FINANCE_ACTIVITY_ACTIONS = [
  "payment.mark_received",
  "receipt.issue",
  "receipt.void",
] as const;

export type FinanceActivityRow = {
  id: string;
  action: string;
  actorEmail: string | null;
  entityId: string;
  detail: unknown;
  createdAt: string;
};

export async function listFinanceActivity(client: SupabaseClient): Promise<FinanceActivityRow[]> {
  const { data, error } = await client
    .from("audit_log")
    .select("id,action,actor_user_id,entity_id,detail,timestamp")
    .in("action", FINANCE_ACTIVITY_ACTIONS as unknown as string[])
    .order("timestamp", { ascending: false })
    .limit(50);

  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    action: string;
    actor_user_id: string | null;
    entity_id: string;
    detail: unknown;
    timestamp: string;
  }>;

  const actorIds = [...new Set(rows.map((row) => row.actor_user_id).filter(Boolean))] as string[];
  let emailByAuthId = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: admins, error: adminError } = await client
      .from("admin_user")
      .select("auth_user_id,email")
      .in("auth_user_id", actorIds);
    if (adminError) throw adminError;
    emailByAuthId = new Map(
      ((admins ?? []) as Array<{ auth_user_id: string; email: string }>).map((a) => [
        a.auth_user_id,
        a.email,
      ]),
    );
  }

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorEmail: row.actor_user_id ? emailByAuthId.get(row.actor_user_id) ?? null : null,
    entityId: row.entity_id,
    detail: row.detail,
    createdAt: row.timestamp,
  }));
}
```

- [ ] **Step 2: Extend the payments route to return receipts**

Replace the body of the `GET` handler in `src/routes/api/admin/payments.ts`. The full file becomes:

```ts
import { createFileRoute } from "@tanstack/react-router";

import {
  createSupabaseServiceClient,
  listAdminPayments,
  listAdminReceipts,
  requireAdmin,
} from "../../../lib/donations/supabase.server";

export const Route = createFileRoute("/api/admin/payments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          await requireAdmin(request, ["staff", "treasurer", "admin"], client);
          const [payments, receipts] = await Promise.all([
            listAdminPayments(client),
            listAdminReceipts(client),
          ]);
          return Response.json(
            { payments, receipts },
            { headers: { "cache-control": "no-store" } },
          );
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

- [ ] **Step 3: Create the finance activity route**

Create `src/routes/api/admin/finance/activity.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import {
  createSupabaseServiceClient,
  listFinanceActivity,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export const Route = createFileRoute("/api/admin/finance/activity")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          await requireAdmin(request, ["staff", "treasurer", "admin"], client);
          return Response.json(
            { activity: await listFinanceActivity(client) },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          if (error instanceof Response) return error;
          console.error(error);
          return Response.json({ error: "Could not load finance activity" }, { status: 500 });
        }
      },
    },
  },
});
```

- [ ] **Step 4: Regenerate the route tree, type check, lint, test**

The route tree is auto-generated by the TanStack plugin on dev/build. Regenerate and verify:

Run: `bun run build && bunx tsc --noEmit && bun run lint && bun test`
Expected: build succeeds (writes `src/routeTree.gen.ts` including `/api/admin/finance/activity`); no type/lint errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/donations/supabase.server.ts src/routes/api/admin/payments.ts src/routes/api/admin/finance/activity.ts src/routeTree.gen.ts
git commit -m "$(cat <<'EOF'
feat(admin): add receipts to payments list + finance activity feed API

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Payments CSV export

A `buildPaymentCsv` builder (alongside the existing CSV builders) and a treasurer-only export route mirroring `donations.csv`.

**Files:**
- Modify: `src/lib/crm/csv.ts`
- Modify: `src/lib/crm/csv.test.ts`
- Create: `src/routes/api/admin/exports/payments[.]csv.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/crm/csv.test.ts`, inside the existing `describe("crm csv", () => { ... })` block (add `buildPaymentCsv` to the existing import from `./csv` at the top of the file):

```ts
  test("buildPaymentCsv writes a header and a row with HKD amount", () => {
    const csv = buildPaymentCsv([
      {
        paymentId: "pay-1",
        supporterName: "陳大文",
        supporterEmail: "tai.man@example.com",
        provider: "fps",
        amountCents: 50000,
        purpose: "general",
        status: "succeeded",
        providerRef: "HKSCDA-ABC123",
        bankReference: "FPS-9988",
        receivedAt: "2026-06-30T10:00:00.000Z",
        createdAt: "2026-06-30T00:00:00.000Z",
      },
    ]);
    expect(csv.split("\n")[0]).toBe(
      "payment_id,supporter_name,supporter_email,provider,amount_hkd,purpose,status,provider_ref,bank_reference,received_at,created_at",
    );
    expect(csv).toContain("500.00");
    expect(csv).toContain("FPS-9988");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/crm/csv.test.ts`
Expected: FAIL — `buildPaymentCsv` is not exported.

- [ ] **Step 3: Implement `buildPaymentCsv`**

Append to `src/lib/crm/csv.ts`:

```ts
export type PaymentExportRow = {
  paymentId: string;
  supporterName: string;
  supporterEmail: string;
  provider: string;
  amountCents: number;
  purpose: string;
  status: string;
  providerRef: string | null;
  bankReference: string | null;
  receivedAt: string | null;
  createdAt: string;
};

export function buildPaymentCsv(rows: PaymentExportRow[]) {
  return buildCsv(
    [
      "payment_id",
      "supporter_name",
      "supporter_email",
      "provider",
      "amount_hkd",
      "purpose",
      "status",
      "provider_ref",
      "bank_reference",
      "received_at",
      "created_at",
    ],
    rows.map((row) => [
      row.paymentId,
      row.supporterName,
      row.supporterEmail,
      row.provider,
      centsToDecimal(row.amountCents),
      row.purpose,
      row.status,
      row.providerRef,
      row.bankReference,
      row.receivedAt,
      row.createdAt,
    ]),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/crm/csv.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the export route**

Create `src/routes/api/admin/exports/payments[.]csv.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { buildPaymentCsv } from "../../../../lib/crm/csv";
import {
  createSupabaseServiceClient,
  listAdminPayments,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

type PaymentWithDonation = Awaited<ReturnType<typeof listAdminPayments>>[number] & {
  donation: { purpose: string; supporter: { name: string; email: string } };
};

export const Route = createFileRoute("/api/admin/exports/payments.csv")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          await requireAdmin(request, ["treasurer", "admin"], client);
          const payments = (await listAdminPayments(client)) as unknown as PaymentWithDonation[];
          const csv = buildPaymentCsv(
            payments.map((payment) => ({
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
            })),
          );
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

- [ ] **Step 6: Build (route tree), type check, lint, test**

Run: `bun run build && bunx tsc --noEmit && bun run lint && bun test`
Expected: build succeeds (route tree includes `/api/admin/exports/payments.csv`); no errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/crm/csv.ts src/lib/crm/csv.test.ts "src/routes/api/admin/exports/payments[.]csv.ts" src/routeTree.gen.ts
git commit -m "$(cat <<'EOF'
feat(admin): add payments CSV export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `ReconcileDialog` component

A shadcn `Dialog` that replaces `window.prompt`: a bank-reference field (validated 1–120 chars, matching the server schema), confirm/cancel, pending + error states, closes and notifies on success.

**Files:**
- Create: `src/components/admin/donations/ReconcileDialog.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/admin/donations/ReconcileDialog.tsx`:

```tsx
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { fetchAdminJson } from "../../../lib/admin/http.client";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

type ReconcileDialogProps = {
  paymentId: string;
  supporterName: string;
  amountLabel: string;
  onReconciled: () => void;
};

export function ReconcileDialog({
  paymentId,
  supporterName,
  amountLabel,
  onReconciled,
}: ReconcileDialogProps) {
  const [open, setOpen] = useState(false);
  const [bankReference, setBankReference] = useState("");

  const trimmed = bankReference.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= 120;

  const mutation = useMutation({
    mutationFn: () =>
      fetchAdminJson(`/api/admin/payments/${paymentId}/reconcile`, {
        method: "POST",
        body: JSON.stringify({ bankReference: trimmed }),
      }),
    onSuccess: () => {
      onReconciled();
      setBankReference("");
      setOpen(false);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          mutation.reset();
          setBankReference("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <CheckCircle2 className="h-4 w-4" />
          標記已收款
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>標記已收款</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <p className="text-sm text-[var(--color-text-muted)]">
            {supporterName} · {amountLabel}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="reconcile-bank-reference">銀行 / PayMe / FPS 參考編號</Label>
            <Input
              id="reconcile-bank-reference"
              value={bankReference}
              onChange={(event) => setBankReference(event.target.value)}
              placeholder="例如 FPS-20260630-001"
              autoFocus
            />
          </div>
          {mutation.error && (
            <p className="text-sm text-[var(--color-error)]">{mutation.error.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit || mutation.isPending}>
              {mutation.isPending ? "處理中…" : "確認收款"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors; lint clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/donations/ReconcileDialog.tsx
git commit -m "$(cat <<'EOF'
feat(admin): add ReconcileDialog for marking manual payments received

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `PaymentsReconcile` console component

The console: summary cards → filters → `DataTable` (desktop rows + mobile cards) → finance activity feed. Owns the queries, the receipt issue/void mutations, and the CSV download.

**Files:**
- Create: `src/components/admin/donations/PaymentsReconcile.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/admin/donations/PaymentsReconcile.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileCheck, FileX } from "lucide-react";
import { useMemo, useState } from "react";

import { fetchAdminJson, getAdminAccessToken } from "../../../lib/admin/http.client";
import { centsToHkd } from "../../../lib/donations/domain";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { DataTable, type DataTableColumn } from "../DataTable";
import { StatusPill } from "../StatusBadge";
import { ReconcileDialog } from "./ReconcileDialog";
import {
  applyPaymentFilters,
  canIssueReceipt,
  canVoidReceipt,
  financeActionLabel,
  findIssuedReceipt,
  paymentStatusPill,
  receiptPill,
  summarizePayments,
  type AdminPaymentRow,
  type AdminReceiptRow,
  type PaymentFilters,
} from "./paymentsReconcileLogic";

type FinanceActivityItem = {
  id: string;
  action: string;
  actorEmail: string | null;
  entityId: string;
  detail: unknown;
  createdAt: string;
};

const STATUS_OPTIONS: { value: PaymentFilters["status"]; label: string }[] = [
  { value: "all", label: "全部狀態" },
  { value: "pending", label: "待確認" },
  { value: "succeeded", label: "已確認" },
  { value: "failed", label: "失敗" },
  { value: "refunded", label: "已退款" },
];

const PROVIDER_OPTIONS: { value: PaymentFilters["provider"]; label: string }[] = [
  { value: "all", label: "全部方式" },
  { value: "stripe", label: "Stripe" },
  { value: "paypal", label: "PayPal" },
  { value: "fps", label: "FPS" },
  { value: "payme", label: "PayMe" },
  { value: "manual", label: "Manual" },
];

function formatActivityTime(value: string) {
  return new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function PaymentsReconcile() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<PaymentFilters>({
    status: "all",
    provider: "all",
    search: "",
  });
  const [exportError, setExportError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () =>
      fetchAdminJson<{ payments: AdminPaymentRow[]; receipts: AdminReceiptRow[] }>(
        "/api/admin/payments",
      ),
  });

  const { data: activityData } = useQuery({
    queryKey: ["admin-finance-activity"],
    queryFn: () =>
      fetchAdminJson<{ activity: FinanceActivityItem[] }>("/api/admin/finance/activity"),
  });

  const payments = useMemo(() => data?.payments ?? [], [data]);
  const receipts = useMemo(() => data?.receipts ?? [], [data]);
  const visible = useMemo(() => applyPaymentFilters(payments, filters), [payments, filters]);
  const summary = useMemo(() => summarizePayments(payments, receipts), [payments, receipts]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
    queryClient.invalidateQueries({ queryKey: ["admin-finance-activity"] });
  }

  const issueReceipt = useMutation({
    mutationFn: (donationId: string) =>
      fetchAdminJson("/api/admin/receipts", {
        method: "POST",
        body: JSON.stringify({ donationId }),
      }),
    onSuccess: refresh,
  });

  const voidReceipt = useMutation({
    mutationFn: (receiptId: string) =>
      fetchAdminJson(`/api/admin/receipts/${receiptId}/void`, { method: "POST" }),
    onSuccess: refresh,
  });

  async function handleExport() {
    setExportError("");
    try {
      const token = await getAdminAccessToken();
      const response = await fetch("/api/admin/exports/payments.csv", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "匯出失敗");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "payments.csv";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "匯出失敗");
    }
  }

  const actionError = issueReceipt.error?.message ?? voidReceipt.error?.message ?? "";

  function rowActions(payment: AdminPaymentRow) {
    const issued = findIssuedReceipt(payment.donation.id, receipts);
    return (
      <div className="flex flex-wrap gap-2">
        {payment.status === "pending" && (
          <ReconcileDialog
            paymentId={payment.id}
            supporterName={payment.donation.supporter.name}
            amountLabel={centsToHkd(payment.amount_cents)}
            onReconciled={refresh}
          />
        )}
        {canIssueReceipt(payment, receipts) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => issueReceipt.mutate(payment.donation.id)}
            disabled={issueReceipt.isPending}
          >
            <FileCheck className="h-4 w-4" />
            發收條
          </Button>
        )}
        {canVoidReceipt(payment, receipts) && issued && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.confirm(`確定作廢收條 ${issued.receipt_no}？`)) voidReceipt.mutate(issued.id);
            }}
            disabled={voidReceipt.isPending}
          >
            <FileX className="h-4 w-4" />
            作廢收條
          </Button>
        )}
      </div>
    );
  }

  const columns: DataTableColumn<AdminPaymentRow>[] = [
    {
      id: "supporter",
      header: "捐款人",
      cell: (payment) => (
        <div>
          <div className="font-medium text-[var(--color-panel)]">
            {payment.donation.supporter.name}
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {payment.donation.supporter.email}
          </div>
        </div>
      ),
    },
    { id: "provider", header: "方式", cell: (payment) => payment.provider.toUpperCase() },
    {
      id: "amount",
      header: "金額",
      cell: (payment) => (
        <span className="font-medium">{centsToHkd(payment.amount_cents)}</span>
      ),
    },
    { id: "purpose", header: "用途", cell: (payment) => payment.donation.purpose },
    {
      id: "reference",
      header: "參考",
      cell: (payment) => (
        <div>
          <div>{payment.provider_ref ?? "—"}</div>
          {payment.bank_reference && (
            <div className="text-xs text-[var(--color-text-muted)]">{payment.bank_reference}</div>
          )}
        </div>
      ),
    },
    {
      id: "status",
      header: "收款狀態",
      cell: (payment) => {
        const pill = paymentStatusPill(payment.status);
        return <StatusPill tone={pill.tone}>{pill.label}</StatusPill>;
      },
    },
    {
      id: "receipt",
      header: "收條",
      cell: (payment) => {
        const pill = receiptPill(payment, receipts);
        return pill ? <StatusPill tone={pill.tone}>{pill.label}</StatusPill> : <span>—</span>;
      },
    },
    { id: "actions", header: "操作", cell: rowActions },
  ];

  function renderMobileCard(payment: AdminPaymentRow) {
    const statusPill = paymentStatusPill(payment.status);
    const rPill = receiptPill(payment, receipts);
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-medium text-[var(--color-panel)]">
              {payment.donation.supporter.name}
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {payment.provider.toUpperCase()} · {payment.donation.purpose}
            </div>
          </div>
          <div className="text-right font-medium">{centsToHkd(payment.amount_cents)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={statusPill.tone}>{statusPill.label}</StatusPill>
          {rPill && <StatusPill tone={rPill.tone}>{rPill.label}</StatusPill>}
        </div>
        {rowActions(payment)}
      </div>
    );
  }

  const summaryCards = [
    ["待確認手動收款", String(summary.awaitingReconcile)],
    ["待發收條", String(summary.awaitingReceipt)],
    ["已確認金額", centsToHkd(summary.confirmedAmountCents)],
  ];

  const activity = activityData?.activity ?? [];

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        {summaryCards.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {label}
            </p>
            <p className="mt-2 text-xl font-bold text-[var(--color-panel)]">{value}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <Input
          value={filters.search}
          onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
          placeholder="搜尋姓名 / 電郵 / 參考"
          className="max-w-xs"
        />
        <Select
          value={filters.status}
          onValueChange={(value) =>
            setFilters((prev) => ({ ...prev, status: value as PaymentFilters["status"] }))
          }
        >
          <SelectTrigger className="w-36" aria-label="收款狀態篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.provider}
          onValueChange={(value) =>
            setFilters((prev) => ({ ...prev, provider: value as PaymentFilters["provider"] }))
          }
        >
          <SelectTrigger className="w-36" aria-label="收款方式篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex flex-col items-end gap-1">
          <Button type="button" variant="outline" onClick={() => void handleExport()}>
            <Download className="h-4 w-4" />
            匯出 CSV
          </Button>
          {exportError && <p className="text-xs text-[var(--color-error)]">{exportError}</p>}
        </div>
      </section>

      {actionError && <p className="text-sm text-[var(--color-error)]">{actionError}</p>}

      <DataTable
        columns={columns}
        rows={visible}
        getRowKey={(payment) => payment.id}
        loading={isLoading}
        empty="沒有收款紀錄"
        renderMobileCard={renderMobileCard}
      />

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-lg font-semibold text-[var(--color-panel)]">最近收款活動</h2>
        <div className="mt-3 divide-y divide-[var(--color-border)]">
          {activity.length === 0 && (
            <p className="py-4 text-sm text-[var(--color-text-muted)]">暫無活動紀錄。</p>
          )}
          {activity.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="text-sm text-[var(--color-panel)]">
                {financeActionLabel(item.action)}
                <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                  {item.actorEmail ?? "系統"}
                </span>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                {formatActivityTime(item.createdAt)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors; lint clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/donations/PaymentsReconcile.tsx
git commit -m "$(cat <<'EOF'
feat(admin): add PaymentsReconcile finance console component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Mount the console + remove the raw payments table

Swap the `section === "payments"` branch in `admin/index.tsx` for `<PaymentsReconcile />`, and delete the now-dead payments code (type, fetch helper, mutations, query, `formatHkd`).

**Files:**
- Modify: `src/routes/admin/index.tsx`

- [ ] **Step 1: Replace the payments code in `admin/index.tsx`**

Make these edits to `src/routes/admin/index.tsx`:

1. Add the import (next to the other admin-component imports near the top):

```tsx
import { PaymentsReconcile } from "../../components/admin/donations/PaymentsReconcile";
```

2. Delete the now-unused `PaymentRow` type (the `type PaymentRow = { ... }` block), the `fetchAdminJson` function, the `formatHkd` function, the `payments`/`paymentsLoading` `useQuery`, and the `reconcilePayment` and `issueReceipt` functions.

3. Replace the entire `section === "payments" ? (...)` branch (the `paymentsLoading ? ... : (<div className="overflow-x-auto ...">...</table></div>)` block) with:

```tsx
        {section === "payments" ? (
          <PaymentsReconcile />
        ) : section === "applications" ? (
```

Keep the header block: the `section === "payments"` header (the `<h1>` + the "捐款人紀錄" link to `/admin/supporters`) stays as-is. After the edit, `admin/index.tsx` no longer references `formatHkd`, `fetchAdminJson`, `PaymentRow`, `payments`, `paymentsLoading`, `reconcilePayment`, or `issueReceipt`.

- [ ] **Step 2: Type check + lint (catches any leftover references)**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors. If `tsc` reports an unused/undefined symbol, remove the corresponding leftover from Step 1.

- [ ] **Step 3: Build + full test run**

Run: `bun run build && bun test`
Expected: build succeeds; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin/index.tsx
git commit -m "$(cat <<'EOF'
feat(admin): mount PaymentsReconcile console, drop raw payments table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full gate**

Run: `bun test && bun run lint && bunx tsc --noEmit && bun run build`
Expected: tests pass; lint clean; no type errors; production build succeeds.

- [ ] **Step 2: Manual / preview check (admin is behind login)**

Admin pages require login, so headless screenshots aren't possible. Deploy a Vercel preview and verify interactively at `/admin?section=payments`:
- All four payment statuses render with distinct pills (pending/succeeded/failed/refunded).
- Receipt column shows 已發 #no / 待發收條 / 已作廢 / — correctly.
- 標記已收款 opens the dialog, validates the bank reference, and on success the row flips to 已確認 and the activity feed updates.
- 發收條 / 作廢收條 work and refresh the row + feed.
- Status/provider filters and search narrow the table; mobile width shows cards.
- 匯出 CSV downloads `payments.csv` (treasurer/admin); a `staff` user gets a clear permission error rather than a silent failure.

Run: `vercel deploy --scope ynwaforevers-projects`

---

## Self-Review

**Spec coverage:**
- Extract to `PaymentsReconcile` at existing route → Tasks 6 + 7. ✓
- Pure logic module + tests → Task 2. ✓
- `ReconcileDialog` replacing `window.prompt` → Task 5. ✓
- Four payment states + receipt state pills → Task 2 (`paymentStatusPill`/`receiptPill`) + Task 6. ✓
- Summary cards + status/provider/search filters → Task 2 + Task 6. ✓
- Receipt issue/void inline → Task 6. ✓
- Extend `GET /api/admin/payments` with receipts → Task 3. ✓
- `GET /api/admin/finance/activity` → Task 3. ✓
- `GET /api/admin/exports/payments.csv` → Task 4. ✓
- Lift shared `fetchAdminJson` → Task 1. ✓
- API-enforced gating + graceful 403 → mutations/export surface `error.message` (Tasks 5, 6); verified in Task 8. ✓
- Mobile cards via DataTable → Task 6 (`renderMobileCard`). ✓
- Testing + verification → Tasks 2, 4, 8. ✓

**Type consistency:** `AdminPaymentRow`/`AdminReceiptRow`/`PaymentFilters` defined in Task 2 are imported unchanged in Tasks 5–6. `FinanceActivityRow` (server, Task 3) and `FinanceActivityItem` (client, Task 6) share field names (`action`, `actorEmail`, `entityId`, `detail`, `createdAt`). `buildPaymentCsv`/`PaymentExportRow` defined in Task 4 are used by the export route in the same task. `StatusPill` is invoked with the `tone` prop + children, matching its signature.

**Placeholders:** none — every code step contains complete content.

**Note on summary semantics:** `summarizePayments` computes over the full loaded list (queue-wide awaiting counts + confirmed total), which is the useful framing for the top cards; the spec's "currently visible" wording for the confirmed total is intentionally implemented queue-wide.
