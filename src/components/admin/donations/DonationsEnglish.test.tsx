import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

import type { AdminPaymentListResult } from "../../../lib/donations/adminPayments";
import type { BankMatchOperation } from "../../../lib/donations/bankMatchConfirmation";
import type {
  BankStatementDryRunResult,
  BankStatementPreviewRow,
} from "../../../lib/donations/bankStatementDryRun";
import type { DeliveryWorklistResult } from "../../../lib/donations/deliveryWorklist";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realQuery = await import("@tanstack/react-query");

// A static render does not mount a dialog's portal, and a dialog is closed until it is clicked,
// so the dialog primitives render their content in place.
mock.module("../../ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div data-dialog>{children}</div>,
  DialogTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
}));

mock.module("../../../lib/admin/useLiveAdminActor", () => ({
  useLiveAdminActor: () => "fixture-finance",
}));

type QueryState = Record<string, unknown>;
let queries: Record<string, QueryState> = {};

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({
    mutate() {},
    mutateAsync: async () => {},
    reset() {},
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
    variables: undefined,
  }),
  useQuery: (options: { queryKey: readonly unknown[] }) => ({
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch() {},
    ...(queries[String(options.queryKey[0])] ?? { data: undefined }),
  }),
}));

const { PaymentsReconcile } = await import("./PaymentsReconcile");
const { ReconcileDialog } = await import("./ReconcileDialog");
const { BankStatementDryRunPanel, BankStatementDryRunPreview } =
  await import("./BankStatementDryRunPanel");
const { BankMatchOperationReview } = await import("./BankMatchOperationReview");
const { DonationDeliveryWorklist, DonationDeliveryWorklistView } =
  await import("./DonationDeliveryWorklist");
const { paymentsCopy, reconcileDialogCopy, deliveryWorklistCopy } = await import("./copy");
const { bankPreviewCopy, bankPanelCopy, bankReviewCopy } = await import("./bankCopy");
const { donationFormatCopy } = await import("./formatCopy");

const supporter = (id: string, name: string, email: string) => ({
  id,
  name,
  email,
  phone: null,
  language: "zh-HK" as const,
});

const payments: AdminPaymentListResult = {
  payments: [
    {
      id: "pay-1",
      provider: "fps",
      provider_ref: "HKSCDA-ABC123",
      amount_cents: 100000,
      status: "pending",
      received_at: null,
      bank_reference: null,
      created_at: "2026-10-01T02:30:00Z",
      donation: {
        id: "don-1",
        purpose: "general",
        custom_purpose: null,
        receipt_requested: true,
        status: "pending",
        supporter: supporter("sup-1", "陳大文", "chan@example.org"),
      },
    },
    {
      id: "pay-2",
      provider: "stripe",
      provider_ref: "pi_123",
      amount_cents: 50050,
      refunded_cents: 10000,
      status: "succeeded",
      received_at: "2026-10-01T02:30:00Z",
      bank_reference: "BANK-REF-2",
      created_at: "2026-10-01T02:30:00Z",
      donation: {
        id: "don-2",
        purpose: "medical",
        custom_purpose: "婚宴回禮",
        receipt_requested: true,
        status: "succeeded",
        supporter: supporter("sup-2", "Ada Wong", "ada@example.org"),
      },
    },
    {
      id: "pay-3",
      provider: "paypal",
      provider_ref: null,
      amount_cents: 20000,
      status: "succeeded",
      received_at: "2026-10-01T02:30:00Z",
      bank_reference: null,
      created_at: "2026-10-01T02:30:00Z",
      donation: {
        id: "don-3",
        purpose: "sponsor",
        custom_purpose: null,
        receipt_requested: true,
        status: "succeeded",
        supporter: supporter("sup-3", "李小明", "lee@example.org"),
      },
    },
  ],
  receipts: [
    { id: "r-1", receipt_no: "HKSCDA-2026-000001", donation_ids: ["don-3"], status: "issued" },
  ],
  total: 3,
  page: 1,
  pageSize: 25,
  summary: { awaitingReconcile: 1, awaitingReceipt: 1, confirmedAmountCents: 123400 },
};

const worklist: DeliveryWorklistResult = {
  page: 1,
  pageSize: 25,
  total: 1,
  jobs: [
    {
      id: "11111111-2222-4333-8444-555555555555",
      paymentId: "22222222-3333-4444-8555-666666666666",
      status: "attention_required",
      attempts: 2,
      errorCode: "provider_error",
      createdAt: "2026-09-28T00:00:00Z",
      nextAttemptAt: "2026-09-29T01:00:00Z",
      paymentStatus: "succeeded",
      donationStatus: "succeeded",
    },
  ],
};

// Names and notes that staff or supporters typed are data, so they stay as they were.
const FIXTURE_TEXT = ["陳大文", "李小明", "婚宴回禮"];

const loadPayments = (role = "treasurer", data: Partial<AdminPaymentListResult> = {}) => {
  queries = {
    "admin-me": { data: { admin: { authUserId: "fixture-finance", status: "active", role } } },
    "admin-payments": { data: { ...payments, ...data } },
    "admin-finance-activity": {
      data: {
        activity: [
          {
            id: "a-1",
            action: "payment.mark_received",
            actorEmail: "staff@example.org",
            entityId: "pay-1",
            detail: {},
            createdAt: "2026-10-01T02:30:00Z",
          },
          {
            id: "a-2",
            action: "receipt.void",
            actorEmail: null,
            entityId: "r-1",
            detail: {},
            createdAt: "2026-10-02T02:30:00Z",
          },
        ],
      },
    },
    "finance-delivery-worklist": { data: worklist },
  };
};

describe("payments reconcile in English", () => {
  test("shows the summary, the filters, the table, the receipt actions and the activity", () => {
    loadPayments();
    const markup = renderAdminInEnglish(<PaymentsReconcile />);
    expectNoChineseText(markup, { allow: FIXTURE_TEXT });
    for (const text of [
      "Manual payments to confirm",
      "Receipts to issue",
      "Confirmed amount",
      "HK$1,234.00",
      'placeholder="Search name, email or reference"',
      'aria-label="Filter by payment status"',
      'aria-label="Filter by payment method"',
      "Export CSV",
      ">Donor<",
      ">Method<",
      ">Amount<",
      ">Purpose<",
      ">Reference<",
      ">Payment status<",
      ">Receipt<",
      ">Actions<",
      "HK$1,000.00",
      "Refunded HK$100.00 · Net received HK$400.50",
      "General",
      "Medical · Other purpose: 婚宴回禮",
      "Sponsorship",
      "BANK-REF-2",
      ">Pending<",
      ">Confirmed<",
      "Receipt to issue",
      "Issued HKSCDA-2026-000001",
      "Issue receipt",
      "Void receipt",
      "Mark as received",
      "1-3 of 3",
      "Page 1 of 1",
      'aria-label="Previous page of payments"',
      'aria-label="Next page of payments"',
      "Recent payment activity",
      "Marked as received",
      "Receipt voided",
      "staff@example.org",
      ">System<",
      "1 Oct 2026 (Thu) 10:30",
      "2 Oct 2026 (Fri) 10:30",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("shows the bank statement panel and the failed jobs to a treasurer, and neither to staff", () => {
    loadPayments();
    const treasurer = renderAdminInEnglish(<PaymentsReconcile />);
    expect(treasurer).toContain("Bank statement preview and one-by-one confirmation");
    expect(treasurer).toContain("Failed receipt and notification jobs");
    loadPayments("staff");
    const staff = renderAdminInEnglish(<PaymentsReconcile />);
    expectNoChineseText(staff, { allow: FIXTURE_TEXT });
    expect(staff).not.toContain("Bank statement preview");
    expect(staff).not.toContain("Failed receipt and notification jobs");
    expect(staff).not.toContain("Issue receipt");
  });

  test("shows the loading failure and the empty states in English", () => {
    queries = {
      "admin-me": { data: { admin: { authUserId: "x", status: "active", role: "staff" } } },
      "admin-payments": { data: undefined, isError: true, error: new Error("down") },
    };
    const failed = renderAdminInEnglish(<PaymentsReconcile />);
    expectNoChineseText(failed);
    expect(failed).toContain("Could not load");
    expect(failed).not.toContain("No payment records");
    // A failed load shows a dash, never a zero amount.
    expect(failed).not.toContain("HK$0.00");
    loadPayments("staff", { payments: [], receipts: [], total: 0 });
    queries["admin-finance-activity"] = { data: { activity: [] } };
    const empty = renderAdminInEnglish(<PaymentsReconcile />);
    expectNoChineseText(empty);
    expect(empty).toContain("No payment records");
    expect(empty).toContain("No activity yet.");
    expect(empty).toContain("0-0 of 0");
  });

  test("keeps the Chinese payments page as it was", () => {
    loadPayments();
    const markup = renderAdminInChinese(<PaymentsReconcile />);
    for (const text of [
      "待確認手動收款",
      "待發收條",
      "已確認金額",
      "HK$1,234",
      'placeholder="搜尋姓名 / 電郵 / 參考"',
      'aria-label="收款狀態篩選"',
      "匯出 CSV",
      "收款狀態",
      "已退款 HK$100 · 實收 HK$400.50",
      "general",
      "medical · 其他用途：婚宴回禮",
      "已發 HKSCDA-2026-000001",
      "發收條",
      "作廢收條",
      "標記已收款",
      "銀行 / PayMe / FPS 參考編號",
      "確認收款",
      "1-3 / 3",
      "1 / 1",
      'aria-label="Previous payments page"',
      "最近收款活動",
      "系統",
      "銀行對帳檔預覽與逐組確認",
      "收條／通知失敗工作",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("HK$1,234.00");
    loadPayments("staff", { payments: [], receipts: [], total: 0 });
    queries["admin-finance-activity"] = { data: { activity: [] } };
    const empty = renderAdminInChinese(<PaymentsReconcile />);
    expect(empty).toContain("沒有收款紀錄");
    expect(empty).toContain("暫無活動紀錄。");
  });
});

describe("mark as received dialog in English", () => {
  test("shows the form in English", () => {
    const markup = renderAdminInEnglish(
      <ReconcileDialog
        paymentId="pay-1"
        supporterName="Ada Wong"
        amountLabel="HK$1,000.00"
        onReconciled={() => {}}
      />,
    );
    expectNoChineseText(markup);
    for (const text of [
      ">Mark as received<",
      "Ada Wong · HK$1,000.00",
      ">Bank, PayMe or FPS reference<",
      'placeholder="For example, FPS-20260630-001"',
      ">Cancel<",
      ">Confirm payment<",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("keeps the Chinese form as it was", () => {
    const markup = renderAdminInChinese(
      <ReconcileDialog
        paymentId="pay-1"
        supporterName="Ada Wong"
        amountLabel="HK$1,000"
        onReconciled={() => {}}
      />,
    );
    for (const text of [
      ">標記已收款<",
      ">取消<",
      ">確認收款<",
      'placeholder="例如 FPS-20260630-001"',
    ]) {
      expect(markup, text).toContain(text);
    }
  });
});

describe("bank statement dry run in English", () => {
  const row = (
    ordinal: number,
    status: BankStatementPreviewRow["status"],
    overrides: Partial<BankStatementPreviewRow> = {},
  ): BankStatementPreviewRow => ({
    ordinal,
    bankReference: `REF-${ordinal}`,
    referenceKey: `ref-${ordinal}`,
    receivedOn: "2026-09-27",
    amountCents: 10_000,
    paymentHint: null,
    invalidReason: null,
    status,
    candidateCount: 0,
    candidates: [],
    ...overrides,
  });
  const candidate = (id: string, providerRef: string | null) => ({
    id,
    provider: "fps" as const,
    providerRef,
    amountCents: 10_000,
    paymentStatus: "pending",
    donationStatus: "pending",
  });
  const result: BankStatementDryRunResult = {
    fileSha256: "a".repeat(64),
    generatedAt: "2026-09-28T00:00:00.000Z",
    summary: { total: 7, invalid: 1, duplicate: 1, credited: 1, candidates: 3, unmatched: 1 },
    rows: [
      row(1, "invalid", { invalidReason: "amount", amountCents: null }),
      row(2, "duplicate_file"),
      row(3, "already_credited"),
      row(4, "candidate_exact", {
        paymentHint: "HINT-4",
        candidateCount: 1,
        candidates: [candidate("payment-4", "HKSCDA-ABC123")],
      }),
      row(5, "candidate_amount_only", {
        candidateCount: 1,
        candidates: [candidate("payment-5", null)],
      }),
      row(6, "ambiguous", {
        candidateCount: 7,
        candidates: [candidate("payment-6", "HKSCDA-DEF456")],
      }),
      row(7, "unmatched"),
    ],
  };

  test("shows the summary, every result and the candidates in English", () => {
    const markup = renderAdminInEnglish(
      <BankStatementDryRunPreview
        result={result}
        page={1}
        selectedOrdinals={[4]}
        onToggle={() => {}}
      />,
    );
    expectNoChineseText(markup);
    for (const text of [
      "7 rows. Invalid 1, duplicate in the file 1, already credited 1, with candidates 3, without a candidate 1.",
      "File SHA-256: ",
      "Previewed: 28 Sep 2026 (Mon) 08:00",
      "Nothing is saved. If a payment changes, upload the file and check it again.",
      'aria-label="Bank candidate preview table"',
      "Candidate preview of the bank statement file, page 1",
      ">Select<",
      ">Row<",
      ">Bank reference / date<",
      ">Amount<",
      ">Result and candidates<",
      "27 Sep 2026 (Sun)",
      "HK$100.00",
      "Invalid data",
      "Reason: the amount is not valid",
      "Duplicate in the file",
      "This bank reference is already credited",
      "Candidate: payment reference matches",
      "Candidate: amount only",
      "Several candidates; check manually",
      "No candidate",
      "1 candidate; showing the first 5 only",
      "7 candidates; showing the first 5 only",
      "No payment reference",
      "payment-4 · FPS · HKSCDA-ABC123",
      'aria-label="Select row 4 for the confirmation preview"',
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("shows the panel in English, before and after the file is chosen", () => {
    const markup = renderAdminInEnglish(<BankStatementDryRunPanel actorUserId="fixture-finance" />);
    expectNoChineseText(markup);
    for (const text of [
      "Bank statement preview and one-by-one confirmation",
      "Step one is a preview and candidate search only.",
      "Standard columns: <code>bank_reference,received_on,currency,amount_hkd,payment_hint</code>",
      ">Choose the standard CSV<",
      ">Create read-only preview<",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("shows the one-by-one confirmation in English", () => {
    const operation: BankMatchOperation = {
      operationId: "22222222-2222-4222-8222-222222222222",
      fileSha256: "a".repeat(64),
      createdAt: "2026-09-28T00:00:00.000Z",
      expiresAt: "2026-09-28T00:15:00.000Z",
      state: "partial",
      items: Array.from({ length: 30 }, (_, index) => ({
        ordinal: index + 1,
        paymentId: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
        bankReference: `BANK-${index + 1}`,
        paymentHint: `HINT-${index + 1}`,
        amountCents: 20000,
        status: (index === 0 ? "pending" : index === 1 ? "conflict" : "succeeded") as
          | "pending"
          | "conflict"
          | "succeeded",
        reasonCode: index === 1 ? "version_changed" : null,
        deliveryJobId: null,
        appliedAt: null,
      })),
    };
    const markup = renderAdminInEnglish(
      <BankMatchOperationReview operation={operation} onApply={() => {}} pendingOrdinal={null} />,
    );
    expectNoChineseText(markup);
    for (const text of [
      ">One-by-one confirmation<",
      "Confirm each bank deposit on its own",
      `Snapshot ${operation.operationId} · File SHA-256 ${operation.fileSha256} · Expires 28 Sep 2026 (Mon) 08:15`,
      'aria-label="Bank one-by-one confirmation table"',
      "Bank matches, page 1",
      ">Row / bank reference<",
      ">Payment / amount<",
      "HK$200.00",
      "Waiting for confirmation",
      "Data has changed. Preview again. · version_changed",
      "Credited",
      ">Credit this payment<",
      "Download results by item (CSV)",
      'aria-label="Bank match results pagination"',
      "Page 1 of 2",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup.match(/Credit this payment/g)).toHaveLength(1);
    const checking = renderAdminInEnglish(
      <BankMatchOperationReview operation={operation} onApply={() => {}} pendingOrdinal={1} />,
    );
    expect(checking).toContain(">Checking…<");
  });

  test("keeps the Chinese bank screens as they were", () => {
    const preview = renderAdminInChinese(<BankStatementDryRunPreview result={result} page={1} />);
    for (const text of [
      "共 7 筆；資料無效 1、檔內重複 1、已入帳 1、有候選 3、沒有候選 1。",
      "預覽時間：2026-09-28T00:00:00.000Z。結果不會儲存；付款事實改變後須重新上載並核對。",
      "2026-09-27",
      "HK$100",
      "原因：amount",
      "只按金額候選",
      "候選 7 筆；僅顯示前 5 筆",
      "無付款參考",
    ]) {
      expect(preview, text).toContain(text);
    }
    const panel = renderAdminInChinese(<BankStatementDryRunPanel actorUserId="fixture-finance" />);
    expect(panel).toContain(
      "第一步只作預覽與候選搜尋，不會確認入帳、退款或發送通知。銀行原始格式須先轉成內部標準 CSV；每檔最多 1,000 筆，僅接受 HKD 入款。只有建立快照後逐筆確認，才會記錄入帳及可恢復的收條工作。",
    );
    expect(panel).toContain("標準欄位：<code>");
  });
});

describe("failed receipt and notification jobs in English", () => {
  test("shows the list, the status and the retry in English", () => {
    const markup = renderAdminInEnglish(
      <DonationDeliveryWorklistView result={worklist} retryingId={null} onRetry={() => {}} />,
    );
    expectNoChineseText(markup);
    for (const text of [
      "1 job to handle. Up to 25 per page.",
      'aria-label="Receipt and notification jobs table"',
      "Receipt and notification jobs, page 1",
      ">Job / payment<",
      ">Status / attempts<",
      ">Failure reason<",
      ">Actions<",
      "Job 11111111-2222-4333-8444-555555555555",
      "Payment 22222222-3333-4444-8555-666666666666",
      "Created: 28 Sep 2026 (Mon) 08:00",
      "Next attempt: 29 Sep 2026 (Tue) 09:00",
      "Needs manual action",
      "Tried 2 times",
      "provider_error",
      ">Retry this job<",
    ]) {
      expect(markup, text).toContain(text);
    }
    const once = renderAdminInEnglish(
      <DonationDeliveryWorklistView
        result={{
          ...worklist,
          jobs: [
            {
              ...worklist.jobs[0]!,
              attempts: 1,
              status: "retryable",
              nextAttemptAt: null,
              paymentStatus: "refunded",
              donationStatus: "refunded",
            },
          ],
        }}
        retryingId={null}
        onRetry={() => {}}
      />,
    );
    expect(once).toContain("Tried 1 time<");
    expect(once).toContain("Can retry");
    expect(once).toContain("The payment status has changed, so this job cannot be retried");
    expect(once).not.toContain("Retry this job");
    expect(
      renderAdminInEnglish(
        <DonationDeliveryWorklistView
          result={{ ...worklist, total: 0, jobs: [] }}
          retryingId={null}
          onRetry={() => {}}
        />,
      ),
    ).toContain("There are no failed jobs.");
  });

  test("shows the panel, its loading state and its paging in English", () => {
    queries = { "finance-delivery-worklist": { data: { ...worklist, total: 40 } } };
    const markup = renderAdminInEnglish(<DonationDeliveryWorklist />);
    expectNoChineseText(markup);
    for (const text of [
      ">Failed receipt and notification jobs<",
      "Only existing failed jobs are listed.",
      "40 jobs to handle. Up to 25 per page.",
      'aria-label="Delivery jobs pagination"',
      "Page 1 of 2",
      ">Previous<",
      ">Next<",
    ]) {
      expect(markup, text).toContain(text);
    }
    queries = { "finance-delivery-worklist": { data: undefined, isLoading: true } };
    const loading = renderAdminInEnglish(<DonationDeliveryWorklist />);
    expectNoChineseText(loading);
    expect(loading).toContain("Loading jobs…");
    queries = {
      "finance-delivery-worklist": { data: undefined, isError: true, error: new Error("down") },
    };
    const failed = renderAdminInEnglish(<DonationDeliveryWorklist />);
    expectNoChineseText(failed);
    expect(failed).toContain("Could not load");
  });

  test("keeps the Chinese list as it was", () => {
    const markup = renderAdminInChinese(
      <DonationDeliveryWorklistView result={worklist} retryingId={null} onRetry={() => {}} />,
    );
    for (const text of [
      "需處理工作 1 項；每頁最多 25 項。",
      "工作 11111111-2222-4333-8444-555555555555",
      "建立：2026-09-28T00:00:00Z",
      "下次：2026-09-29T01:00:00Z",
      "需人工處理",
      "已嘗試 2 次",
      "重試此工作",
    ]) {
      expect(markup, text).toContain(text);
    }
  });
});

describe("the payments copy modules", () => {
  test("have no Chinese in English", () => {
    expectNoChineseInCopy(paymentsCopy.en);
    expectNoChineseInCopy(reconcileDialogCopy.en);
    expectNoChineseInCopy(deliveryWorklistCopy.en);
    expectNoChineseInCopy(bankPreviewCopy.en);
    expectNoChineseInCopy(bankPanelCopy.en);
    expectNoChineseInCopy(bankReviewCopy.en);
  });

  test("keep the Chinese words and whitespace they always had", () => {
    expect(bankPanelCopy.zh.confirmApply("REF-1", "pay-1", "HINT", "HK$100")).toBe(
      "請核對銀行參考 REF-1、付款 pay-1、付款參考 HINT 及 HK$100，確定只確認此筆入帳？",
    );
    expect(bankPanelCopy.zh.selected(2)).toBe(
      "已選取 2 筆付款參考相符候選；其他結果不能建立入帳快照。",
    );
    expect(bankReviewCopy.zh.snapshotLine("op", "sha", "later")).toBe(
      "快照 op · 檔案 SHA-256 sha · 到期 later",
    );
    expect(deliveryWorklistCopy.zh.latestStatus("complete")).toBe(
      "工作最新狀態：complete。付款記錄不會重複入帳。",
    );
    expect(paymentsCopy.zh.confirmVoid("HKSCDA-2026-000001")).toBe(
      "確定作廢收條 HKSCDA-2026-000001？",
    );
  });

  test("write counts with a singular for one and a plural for the rest", () => {
    expect(deliveryWorklistCopy.en.summary(1)).toBe("1 job to handle. Up to 25 per page.");
    expect(deliveryWorklistCopy.en.summary(3)).toBe("3 jobs to handle. Up to 25 per page.");
    expect(deliveryWorklistCopy.en.attempts(1)).toBe("Tried 1 time");
    expect(deliveryWorklistCopy.en.attempts(3)).toBe("Tried 3 times");
    expect(bankPreviewCopy.en.candidateCount(1)).toBe("1 candidate; showing the first 5 only");
    expect(bankPanelCopy.en.selected(1)).toBe(
      "1 candidate with a matching payment reference selected. Other results cannot be used to create a credit snapshot.",
    );
    expect(paymentsCopy.en.range(26, 50, 1234)).toBe("26-50 of 1,234");
  });

  test("format amounts and times as each language always has", () => {
    const zh = donationFormatCopy.zh;
    const en = donationFormatCopy.en;
    expect(zh.money(100000)).toBe("HK$1,000");
    expect(zh.money(50050)).toBe("HK$500.50");
    expect(en.money(100000)).toBe("HK$1,000.00");
    expect(en.money(50050)).toBe("HK$500.50");
    expect(zh.timestamp("2026-09-28T00:00:00Z")).toBe("2026-09-28T00:00:00Z");
    expect(en.timestamp("2026-09-28T00:00:00Z")).toBe("28 Sep 2026 (Mon) 08:00");
    expect(en.timestamp("not a date")).toBe("not a date");
    expect(zh.day("2026-09-27")).toBe("2026-09-27");
    expect(en.day("2026-09-27")).toBe("27 Sep 2026 (Sun)");
    expect(zh.activityTime("2026-10-01T02:30:00Z")).toBe(
      new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date("2026-10-01T02:30:00Z"),
      ),
    );
    expect(en.activityTime("2026-10-01T02:30:00Z")).toBe("1 Oct 2026 (Thu) 10:30");
  });
});
