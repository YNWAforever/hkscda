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
    const pill = receiptPill(
      payment({ status: "succeeded", donation: { ...payment().donation, status: "succeeded" } }),
      [issuedReceipt],
    );
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

  test("treasurer actions are hidden for staff users", () => {
    const pendingManual = payment({ provider: "fps", status: "pending" });
    const succeeded = payment({
      status: "succeeded",
      donation: { ...payment().donation, status: "succeeded", receipt_requested: true },
    });

    expect(canReconcile(pendingManual, "staff")).toBe(false);
    expect(canReconcile(pendingManual, "treasurer")).toBe(true);
    expect(canIssueReceipt(succeeded, [], "staff")).toBe(false);
    expect(canIssueReceipt(succeeded, [], "admin")).toBe(true);
    expect(canVoidReceipt(succeeded, [issuedReceipt], "staff")).toBe(false);
    expect(canVoidReceipt(succeeded, [issuedReceipt], "treasurer")).toBe(true);
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
        payment({
          status: "succeeded",
          donation: { ...payment().donation, status: "succeeded", receipt_requested: false },
        }),
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
      donation: {
        ...payment().donation,
        supporter: { ...payment().donation.supporter, name: "Mary", email: "mary@x.io" },
      },
    }),
  ];

  test("filters by status", () => {
    expect(
      applyPaymentFilters(rows, { status: "pending", provider: "all", search: "" }).map(
        (r) => r.id,
      ),
    ).toEqual(["a"]);
  });

  test("filters by provider", () => {
    expect(
      applyPaymentFilters(rows, { status: "all", provider: "paypal", search: "" }).map((r) => r.id),
    ).toEqual(["c"]);
  });

  test("search matches name, email, provider_ref and bank_reference, case-insensitive", () => {
    expect(
      applyPaymentFilters(rows, { status: "all", provider: "all", search: "mary" }).map(
        (r) => r.id,
      ),
    ).toEqual(["c"]);
    expect(
      applyPaymentFilters(rows, { status: "all", provider: "all", search: "ref-9" }).map(
        (r) => r.id,
      ),
    ).toEqual(["b"]);
    expect(
      applyPaymentFilters(rows, { status: "all", provider: "all", search: "陳" }).map((r) => r.id),
    ).toEqual(["a", "b"]);
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
