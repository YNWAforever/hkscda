import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

import { buildSponsorshipReminderDraft } from "../../../lib/sponsorshipAdmin/reminderDraft";
import type {
  PaymentProofRecord,
  PledgeDetail,
  PledgeSummary,
} from "../../../lib/sponsorshipAdmin/types";
import { adminPageCopy } from "../adminPageCopy";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realQuery = await import("@tanstack/react-query");

/**
 * The screens read their data through React Query. This stand-in answers by the first part of
 * the query key, so a static render shows a loaded screen. A dialog or drawer is closed or in a
 * portal until it is clicked, so the sheet renders its content in place.
 */
type Role = "staff" | "treasurer" | "admin";
let role: Role = "admin";
let listError: Error | null = null;
let pledgeError: Error | null = null;
let pledgeOverride: Partial<PledgeDetail> = {};
let financeData: unknown;

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({ mutate() {}, isPending: false, error: null, data: undefined }),
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    const key = String(options.queryKey[0]);
    const base = { isLoading: false, isFetching: false, isError: false, error: null, refetch() {} };
    if (key === "admin-me") return { ...base, data: { admin: { role } } };
    if (key === "sponsorship-pledges")
      return listError
        ? { ...base, data: undefined, error: listError }
        : { ...base, data: { pledges: pledges, total: 3 } };
    if (key === "sponsorship-pledge")
      return pledgeError
        ? { ...base, data: undefined, error: pledgeError }
        : { ...base, data: { pledge: { ...detail, ...pledgeOverride } } };
    if (key === "sponsorship-followup-assignees")
      return {
        ...base,
        data: { assignees: [{ authUserId: "u-1", email: "staff@example.org", role: "staff" }] },
      };
    if (key === "sponsorship-finance") return { ...base, data: financeData };
    return { ...base, data: undefined };
  },
}));
mock.module("../../ui/sheet", () => ({
  Sheet: ({ children }: { children?: ReactNode }) => <div data-sheet>{children}</div>,
  SheetContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

const { PledgeReviewLane } = await import("./PledgeReviewLane");
const { PledgeDetailDrawer } = await import("./PledgeDetailDrawer");
const { FinancePanel } = await import("./FinancePanel");
const { ReminderDraftPanel, ReminderDraftPreview } = await import("./ReminderDraftPanel");
const { SponsorshipFollowupBulkPanel } = await import("./SponsorshipFollowupBulkPanel");
const { pledgeLaneCopy } = await import("./copy");
const { pledgeDrawerCopy } = await import("./drawerCopy");
const { financeCopy } = await import("./financeCopy");
const { followupBulkCopy, reminderDraftCopy } = await import("./bulkCopy");
const { sponsorshipFormatCopy } = await import("./formatCopy");

// Names staff typed are data: they are shown as stored in both languages.
const SUPPORTER = "陳大文";
const ANIMAL = "小白";
const SECOND_ANIMAL = "小黑";
const DATA = [SUPPORTER, ANIMAL, SECOND_ANIMAL];

const pendingProof: PaymentProofRecord = {
  id: "proof-1",
  revision: 2,
  pledgeId: "pledge-1",
  storagePath: "pledge-1/proof-1.png",
  fileName: "slip.png",
  fileType: "image/png",
  fileSize: 1000,
  paymentMethod: "fps",
  reference: "FPS-001",
  amountCents: 30000,
  paymentDate: "2026-09-30",
  reviewStatus: "pending",
  source: "public",
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: "2026-09-30T02:30:00Z",
};
const approvedProof: PaymentProofRecord = {
  ...pendingProof,
  id: "proof-2",
  storagePath: null,
  fileName: null,
  fileType: null,
  paymentMethod: "bank_transfer",
  reference: null,
  amountCents: 30050,
  paymentDate: "2026-08-30",
  reviewStatus: "approved",
  source: "staff",
  reviewNote: "Checked the bank slip",
  createdAt: "2026-08-30T02:30:00Z",
};
const rejectedProof: PaymentProofRecord = {
  ...pendingProof,
  id: "proof-3",
  paymentMethod: "paypal",
  reviewStatus: "rejected",
  createdAt: "2026-07-30T02:30:00Z",
};

const pledges: PledgeSummary[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    supporterId: "sup-1",
    supporterName: SUPPORTER,
    supporterEmail: "chan@example.org",
    monthlyTier: "300",
    amountCents: 30000,
    currency: "HKD",
    language: "zh-HK",
    status: "needs_followup",
    createdAt: "2026-08-01T02:30:00Z",
    updatedAt: "2026-10-01T02:30:00Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    supporterId: "sup-2",
    supporterName: "Ada Wong",
    supporterEmail: null,
    monthlyTier: "custom",
    amountCents: 12345,
    currency: "HKD",
    language: "en",
    status: "active",
    createdAt: "2026-09-01T02:30:00Z",
    updatedAt: "2026-10-01T02:30:00Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    supporterId: "sup-3",
    supporterName: "Lee Siu Ming",
    supporterEmail: "lee@example.org",
    monthlyTier: "100",
    amountCents: 10000,
    currency: "HKD",
    language: "zh-HK",
    status: "pending_payment",
    createdAt: "2026-09-15T02:30:00Z",
    updatedAt: "2026-10-01T02:30:00Z",
  },
];

const detail: PledgeDetail = {
  ...pledges[0]!,
  followupAssigneeUserId: null,
  followupVersion: 3,
  supporterPhone: "9123 4567",
  contactSubmission: {
    supporterName: "Chan T M",
    email: "chan2@example.org",
    phone: "6123 4567",
    source: "public",
    status: "new",
  },
  notes: null,
  preferences: [
    { id: "pref-1", rank: 1, animalId: "a1", animalNameSnapshot: ANIMAL, animalState: null },
    { id: "pref-2", rank: 2, animalId: "a2", animalNameSnapshot: SECOND_ANIMAL, animalState: null },
  ],
  proofHistory: [pendingProof, approvedProof, rejectedProof],
  currentProof: pendingProof,
  periods: [
    {
      id: "period-1",
      periodMonth: "2026-08-01",
      committedCents: 25050,
      allocatedCents: 25050,
      outstandingCents: 0,
      allocations: [
        {
          id: "alloc-1",
          proofId: "proof-2",
          amountCents: 25050,
          reversesAllocationId: null,
          note: null,
          createdAt: "2026-09-01T02:30:00Z",
        },
      ],
    },
    {
      id: "period-2",
      periodMonth: "2026-09-01",
      committedCents: 30000,
      allocatedCents: 0,
      outstandingCents: 30000,
      allocations: [],
    },
  ],
  assignments: [
    {
      id: "asg-1",
      animalId: "a1",
      animalNameSnapshot: ANIMAL,
      startedOn: "2026-08-02",
      endedOn: null,
      endReason: null,
      note: null,
      endNote: null,
      animalState: null,
      reviewReason: "adopted",
    },
    {
      id: "asg-2",
      animalId: "a2",
      animalNameSnapshot: SECOND_ANIMAL,
      startedOn: "2026-06-02",
      endedOn: "2026-07-02",
      endReason: "transferred",
      note: null,
      endNote: "Moved to Momo",
      animalState: null,
      reviewReason: null,
    },
  ],
  needsAnimal: true,
  recentAuditLog: [
    {
      id: "audit-1",
      actorUserId: "u1",
      action: "sponsorship_pledge.proof_reviewed",
      detail: {},
      timestamp: "2026-10-01T02:30:00Z",
    },
    {
      id: "audit-2",
      actorUserId: "u1",
      action: "some.unknown_action",
      detail: {},
      timestamp: "2026-09-01T02:30:00Z",
    },
  ],
};

const finance = {
  canRefund: true,
  canCoordinate: true,
  receipts: [
    { proof_id: "proof-2", receipt_no: "R-2026-0001", status: "issued" },
    { proof_id: "proof-2", receipt_no: "R-2026-0002", status: "void" },
  ],
  candidates: [
    {
      id: "pay-1",
      amount_cents: 30050,
      bank_reference: "BANK-9",
      received_at: "2026-08-31T02:30:00Z",
    },
    { id: "pay-2", amount_cents: 30050, bank_reference: null, received_at: null },
  ],
  sources: [] as Array<{
    proof_id: string;
    payment_id: string;
    donation_id: string;
    source: string;
  }>,
  refunds: [{ proof_id: "proof-2", amount_cents: 5000, reason: "partial" }],
  deliveries: [
    {
      id: "del-1",
      event: "proof_recorded",
      status: "queued",
      attempts: 1,
      last_error: null,
      delivery_state: "delivered",
    },
    {
      id: "del-2",
      event: "mystery",
      status: "weird",
      attempts: 3,
      last_error: "Provider timeout",
      delivery_state: "bounced",
    },
    {
      id: "del-3",
      event: "refund_recorded",
      status: "failed",
      attempts: 2,
      last_error: null,
      delivery_state: null,
    },
  ],
};

function expectAll(markup: string, texts: string[]) {
  for (const text of texts) expect(markup, text).toContain(text);
}

describe("pledge review list in English", () => {
  test("shows the filters, columns, rows and follow-up selection in English", () => {
    role = "staff";
    listError = null;
    const markup = renderAdminInEnglish(<PledgeReviewLane />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Pledge review",
      "3 total",
      "Filter by proof review",
      "Search supporter name, email or reference",
      "Per page",
      "Refresh",
      // columns
      "Supporter",
      "Pledge amount",
      "Created",
      "Status",
      ">Select<",
      ">Review<",
      // rows
      `Review ${SUPPORTER}`,
      "Review Ada Wong",
      "HK$300.00/month",
      "HK$123.45/month",
      "1 Aug 2026 (Sat)",
      "Needs follow-up",
      "Confirmed",
      "Pending payment",
      `Select ${SUPPORTER} for follow-up`,
      "Select for follow-up",
      // follow-up selection and the bulk panel under it
      "Sponsorship follow-up selection",
      "Select follow-ups on this page",
      "Select all matching (up to 1,000)",
      "Clear selection",
      "first filter by the",
      "Bulk assign sponsorship follow-up",
    ]);
  });

  test("shows no follow-up selection to a treasurer", () => {
    role = "treasurer";
    const markup = renderAdminInEnglish(<PledgeReviewLane />);
    expectNoChineseText(markup, { allow: DATA });
    expect(markup).not.toContain("Sponsorship follow-up selection");
    expect(markup).toContain("Pledge review");
  });

  test("shows a failed load in English", () => {
    role = "staff";
    listError = new Error("boom");
    const markup = renderAdminInEnglish(<PledgeReviewLane />);
    listError = null;
    expectNoChineseText(markup, { allow: DATA });
    expect(markup).toContain("Could not load");
  });

  test("keeps the Chinese screen as it was", () => {
    role = "staff";
    const markup = renderAdminInChinese(<PledgeReviewLane />);
    expectAll(markup, [
      "承諾審核",
      "憑證審核篩選",
      "助養跟進選取",
      "選取本頁待跟進",
      "選取全部符合條件（最多 1000 筆）",
      "清除選取",
      "選取全部前，請先篩選「待跟進」。",
      "批量分派助養跟進",
      "HK$300/月",
      `審核 ${SUPPORTER}`,
      `選取跟進 ${SUPPORTER}`,
      "2026-08-01",
    ]);
  });
});

describe("pledge detail drawer in English", () => {
  const drawer = (
    <PledgeDetailDrawer pledgeId={detail.id} onClose={() => {}} onChanged={() => {}} />
  );

  test("shows every section of a pledge that needs follow-up in English", () => {
    role = "admin";
    pledgeOverride = {};
    financeData = finance;
    const markup = renderAdminInEnglish(drawer);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Pledge details",
      "Close",
      "Needs follow-up",
      "chan@example.org · 9123 4567",
      "HK$300.00/month (HK$300.00 tier)",
      "Created 1 Aug 2026 (Sat)",
      "Animal ranking",
      // follow-up assignment
      "Sponsorship follow-up",
      "No follow-up staff member assigned",
      "Follow-up staff member",
      "Choose staff member",
      "Assign follow-up",
      // reminder draft
      "Sponsorship month follow-up draft",
      "Check and create draft",
      // record payment
      "Record payment",
      'aria-label="Payment method"',
      "Amount (HKD)",
      "Payment date",
      "Payment proof (optional)",
      "Save payment record",
      // review proof
      "Review payment proof",
      "FPS · FPS-001 · HK$300.00",
      "Load payment proof",
      "Approve",
      "Reject",
      // cancel
      "Cancellation note",
      "Cancel sponsorship",
      // animals
      "Confirmed sponsored animals",
      "Started 2 Aug 2026 (Sun)",
      "Adopted",
      "Ended 2 Jul 2026 (Thu)",
      "Moved to another animal",
      "Moved to Momo",
      "End sponsorship",
      "This sponsorship is still being paid but backs no animal",
      "Animal UUID",
      "Add animal",
      // finance panel inside the drawer
      "Payments, months and notifications",
      // months
      "Sponsorship months",
      ">Aug 2026<",
      ">Sep 2026<",
      "Paid",
      "Unpaid",
      "Monthly pledge HK$250.50 · Allocated HK$250.50",
      "Monthly pledge HK$300.00 · Allocated HK$0.00 · Outstanding for follow-up HK$300.00 (not a debt)",
      // proof history
      "Payment proof history",
      "(current)",
      "Submitted by supporter",
      "Recorded by staff",
      "Bank transfer · - · HK$300.50 · Recorded by staff",
      "File: slip.png",
      "Note: Checked the bank slip",
      "No file attached",
      // activity
      "Recent activity",
      "Payment proof reviewed",
      "Unknown action",
      "View full supporter timeline",
    ]);
    // A stored code is never printed as a word in an English screen.
    for (const code of ["bank_transfer", "sponsorship_pledge.", "some.unknown_action"]) {
      expect(markup, code).not.toContain(code);
    }
  });

  test("shows a treasurer the proof review but not the coordinator actions", () => {
    role = "treasurer";
    pledgeOverride = {};
    const markup = renderAdminInEnglish(drawer);
    expectNoChineseText(markup, { allow: DATA });
    expect(markup).toContain("Review payment proof");
    for (const hidden of [
      "Sponsorship follow-up",
      "Record payment",
      "Cancel sponsorship",
      "End sponsorship",
      "Sponsorship month follow-up draft",
    ]) {
      expect(markup, hidden).not.toContain(hidden);
    }
  });

  test("shows a cancelled pledge with nothing recorded in English", () => {
    role = "admin";
    pledgeOverride = {
      status: "cancelled",
      monthlyTier: "custom",
      supporterEmail: null,
      supporterPhone: null,
      contactSubmission: null,
      proofHistory: [],
      currentProof: null,
      periods: [],
      assignments: [],
      preferences: [],
      recentAuditLog: [],
      needsAnimal: false,
    };
    const markup = renderAdminInEnglish(drawer);
    pledgeOverride = {};
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, ["Cancelled", "HK$300.00/month (Custom)", "- · -"]);
    expect(markup).not.toContain("Sponsorship months");
  });

  test("writes a sponsorship month as a month and year in English, in January and December too", () => {
    role = "admin";
    const month = detail.periods[1]!;
    pledgeOverride = {
      periods: [
        { ...month, id: "period-dec", periodMonth: "2025-12-01" },
        { ...month, id: "period-jan", periodMonth: "2026-01-01" },
      ],
    };
    const english = renderAdminInEnglish(drawer);
    const chinese = renderAdminInChinese(drawer);
    pledgeOverride = {};
    expectNoChineseText(english, { allow: DATA });
    expectAll(english, [">Dec 2025<", ">Jan 2026<"]);
    expectAll(chinese, [">2025-12<", ">2026-01<"]);
  });

  test("says what to do when the pledge cannot be loaded, and shows the reason as it came", () => {
    role = "admin";
    pledgeError = new Error("Sponsorship pledge not found");
    const english = renderAdminInEnglish(drawer);
    const chinese = renderAdminInChinese(drawer);
    pledgeError = null;
    expectNoChineseText(english);
    expect(english).toContain(
      "Sponsorship pledge not found. Close this panel and open the pledge again.",
    );
    // Chinese shows the reason alone, as it always did.
    expect(chinese).toContain(">Sponsorship pledge not found</p>");
  });

  test("keeps the Chinese drawer as it was", () => {
    role = "admin";
    pledgeOverride = {};
    const markup = renderAdminInChinese(drawer);
    expectAll(markup, [
      "承諾詳情",
      "關閉",
      "需要跟進",
      "HK$300/月（300）",
      "建立於 2026-08-01",
      "助養跟進分派",
      "尚未分派跟進職員",
      "助養月份跟進草稿",
      "記錄付款",
      "審核付款證明",
      "已確認助養動物",
      "助養月份",
      "每月意向 HK$250.50 · 已分配 HK$250.50",
      "每月意向 HK$300 · 已分配 HK$0 · 待跟進 HK$300（非債務）",
      "已付",
      "待付",
      "收款、月份及通知",
      "付款證明記錄",
      "近期活動",
      "查看完整支持者時間軸",
      "fps · FPS-001 · HK$300",
      "bank_transfer · - · HK$300.50 · 職員記錄",
      "sponsorship_pledge.proof_reviewed",
    ]);
  });
});

describe("finance panel in English", () => {
  const panel = (proofId = "") => (
    <FinancePanel pledge={detail} onChanged={async () => {}} initialProofId={proofId} />
  );

  test("shows the panel before a payment is chosen", () => {
    financeData = finance;
    const markup = renderAdminInEnglish(panel());
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Payments, months and notifications",
      "Month allocations only share verified payments",
      "Supporter payment and receipt records",
      "Payment reconciliation and receipts",
      "Create follow-up months up to this month",
      "Contact details as submitted (original kept)",
      "Chan T M · chan2@example.org · 6123 4567",
      "Source: public sponsorship application",
      "How it was verified and why",
      "Verify and update supporter record",
      "Verified payments",
      "Choose a payment",
      "30 Aug 2026 (Sun) · HK$300.50 · Manual record",
      "Notification follow-up",
      "Retry queued notifications",
    ]);
  });

  test("shows the actions for a chosen payment in English", () => {
    financeData = finance;
    const markup = renderAdminInEnglish(panel("proof-2"));
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Earlier payment still to be reconciled by finance and not credited again",
      " · Refunded HK$50.00 · Net received HK$250.50",
      "Receipts: R-2026-0001 (issued), R-2026-0002 (voided)",
      "Reason for the change",
      "Original month allocation",
      "Choose the original allocation",
      "Aug 2026 · HK$250.50",
      "Add allocation reversal",
      "Month to reallocate to",
      "Amount to reallocate (HKD; HK$0.00 left)",
      "Allocate this amount to the month",
      "Existing payment to reconcile",
      "Choose an existing payment from the same supporter",
      "31 Aug 2026 (Mon) · HK$300.50 · BANK-9",
      " · HK$300.50 · No bank reference",
      "Reconcile and link existing payment",
      "Record a refund that has already been made (part or all)",
      "Bank reference of the completed refund",
      "Refund amount (HKD; up to HK$250.50)",
      "Record completed refund",
    ]);
  });

  test("shows a linked payment, and a payment with no receipts, in English", () => {
    financeData = {
      ...finance,
      sources: [
        { proof_id: "proof-2", payment_id: "pay-1", donation_id: "don-1", source: "reconciled" },
      ],
      receipts: [],
      refunds: [],
    };
    const markup = renderAdminInEnglish(panel("proof-2"));
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Linked to a single payment entry",
      "Receipts: none issued",
      "Record that the sponsor asked for a receipt",
    ]);
    expect(markup).not.toContain("Refunded HK$");
  });

  test("writes each notification in English, including an unknown event and status", () => {
    financeData = finance;
    const markup = renderAdminInEnglish(panel());
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Payment details received · Waiting to send · Delivered to the recipient",
      "Tried 1 time",
      "Notification · Not confirmed · Bounced: follow up · Tried 3 times · Provider timeout",
      "Refund recorded · Failed to send, can be retried · No delivery evidence yet · Tried 2 times",
    ]);
    expect(markup).not.toContain("Tried 1 times");
  });

  test("shows no actions when finance details have not loaded", () => {
    financeData = undefined;
    const markup = renderAdminInEnglish(panel());
    expectNoChineseText(markup, { allow: DATA });
    expect(markup).not.toContain("Verify and update supporter record");
  });

  test("keeps the Chinese panel as it was", () => {
    financeData = finance;
    const markup = renderAdminInChinese(panel("proof-2"));
    expectAll(markup, [
      "收款、月份及通知",
      "月份分配只分攤已核實的收款，不另計收入。未付款月份只供服務跟進。",
      "聯絡人收款及收據紀錄",
      "財務核對及收據",
      "建立截至本月的跟進月份",
      "提交時的聯絡資料（保留原始版本）",
      "已核實，更新聯絡人主檔",
      "已核實付款",
      "歷史收款尚待財務核對，未重入帳 · 已退款 HK$50 · 實收 HK$250.50",
      "收據：R-2026-0001（已簽發）、R-2026-0002（已作廢）",
      "重新分配金額（港元；尚餘 HK$0）",
      "退款金額（港元；可退 HK$250.50）",
      "記錄已完成退款",
      "收到付款資料 · 等候傳送 · 已送達收件伺服器 · 嘗試 1 次",
      "通知 · 未確認 · 退信：需要跟進 · 嘗試 3 次 · Provider timeout",
      "退款已記錄 · 傳送失敗，可重試 · 尚無送達證據 · 嘗試 2 次",
      "重試待傳送通知",
    ]);
  });
});

describe("reminder draft in English", () => {
  const now = new Date("2026-09-28T02:00:00Z");
  const month = {
    id: "period-1",
    periodMonth: "2026-08-01",
    outstandingCents: 12_345,
    allocations: [],
  };
  const reminderPledge = (overrides: Record<string, unknown> = {}) =>
    ({
      id: "pledge-1",
      supporterName: "Alex",
      supporterEmail: "alex@example.invalid",
      language: "en",
      status: "active",
      proofHistory: [],
      periods: [month],
      ...overrides,
    }) as Parameters<typeof buildSponsorshipReminderDraft>[0];

  test("labels the draft for staff in English", () => {
    const draft = buildSponsorshipReminderDraft(reminderPledge(), now);
    const markup = renderAdminInEnglish(<ReminderDraftPreview result={draft} />);
    expectNoChineseText(markup);
    expectAll(markup, [
      "Recipient: Alex &lt;alex@example.invalid&gt;",
      "Month to reconcile: Aug 2026.",
      "HK$123.45",
      "not a finding that money is owed",
      "For internal review only. The draft was made on 28 Sep 2026 (Mon) 10:00.",
      "Sending needs separate approval.",
      "Draft subject",
      "Draft body",
      "Sponsorship record follow-up: 2026-08",
    ]);
    expect(markup.toLowerCase()).toContain("readonly");
  });

  test("shows the draft text as it is for a supporter who reads Chinese", () => {
    // The draft is outward copy for the supporter, so the admin's language does not touch it.
    const draft = buildSponsorshipReminderDraft(
      reminderPledge({ language: "zh-HK", supporterName: SUPPORTER }),
      now,
    );
    if (draft.kind !== "draft") throw new Error("expected a draft");
    const markup = renderAdminInEnglish(<ReminderDraftPreview result={draft} />);
    expectNoChineseText(markup, { allow: [draft.subject, draft.body, SUPPORTER] });
    expect(markup).toContain("Draft subject");
    expect(markup).toContain(draft.subject);
    expect(markup).toContain("我們正核對您 2026-08 的助養紀錄");
  });

  test("explains in English why no draft can be made", () => {
    const expected: Record<string, string> = {
      status: "This sponsorship is not confirmed yet",
      recipient: "There is no valid recipient email or name",
      proof_pending: "A payment proof is waiting to be verified",
      invalid_ledger: "The month records are incomplete",
      no_past_open_period: "No past month has an unreconciled pledge",
      adjustment_review: "The month records include a refund or reversal",
    };
    for (const [reason, text] of Object.entries(expected)) {
      const markup = renderAdminInEnglish(
        <ReminderDraftPreview
          result={{
            kind: "unavailable",
            reason: reason as "status" | "recipient" | "proof_pending",
          }}
        />,
      );
      expectNoChineseText(markup);
      expect(markup, reason).toContain(text);
    }
  });

  test("shows the panel before a draft is made, in English and in Chinese", () => {
    const english = renderAdminInEnglish(<ReminderDraftPanel pledgeId="p1" />);
    expectNoChineseText(english);
    expectAll(english, [
      "Sponsorship month follow-up draft",
      "This only checks past months and verified payment records",
      "Check and create draft",
    ]);
    const chinese = renderAdminInChinese(<ReminderDraftPanel pledgeId="p1" />);
    expectAll(chinese, ["助養月份跟進草稿", "只檢視已過月份及已核實付款紀錄", "核對並產生草稿"]);
  });

  test("keeps the Chinese preview as it was", () => {
    const draft = buildSponsorshipReminderDraft(
      reminderPledge({ language: "zh-HK", supporterName: SUPPORTER }),
      now,
    );
    const markup = renderAdminInChinese(<ReminderDraftPreview result={draft} />);
    expectAll(markup, [
      "收件人：陳大文 &lt;alex@example.invalid&gt;",
      "待核對月份：2026-08；內部紀錄未核對承諾：HK$123.45。此數字不是欠款認定，亦不會寫入電郵草稿。",
      "只供內部審閱。草稿於 2026-09-28T02:00:00.000Z 產生；資料或憑證變動後須重新核對。發送需另行審批。",
      "主旨草稿",
      "內容草稿",
    ]);
  });
});

describe("bulk follow-up panel and animal picker in English", () => {
  const panel = (selected: string[]) => (
    <SponsorshipFollowupBulkPanel
      selectedIds={selected}
      filterKey="k"
      selectionDisabled={false}
      onApplied={() => {}}
    />
  );

  test("shows the bulk assignment panel in English", () => {
    const markup = renderAdminInEnglish(panel(["a", "b"]));
    expectNoChineseText(markup);
    expectAll(markup, [
      "Bulk follow-up assignment for sponsorships",
      "Bulk assign sponsorship follow-up",
      "This only changes the follow-up owner",
      "The preview is valid for 15 minutes",
      "Follow-up owner",
      'aria-label="Bulk follow-up owner"',
      "Choose an enabled staff member",
      "staff@example.org",
      "2 selected (maximum 1,000)",
      "Preview assignment",
    ]);
  });

  test("keeps the Chinese bulk panel as it was", () => {
    const markup = renderAdminInChinese(panel(["a", "b"]));
    expectAll(markup, [
      "助養跟進批量分派",
      "批量分派助養跟進",
      "只改負責職員；不確認付款、不審核憑證、不發送提醒。預覽有效 15 分鐘；套用時逐筆檢查狀態、版本及職員權限。",
      "負責職員",
      "選擇已啟用的職員",
      "已選 2 筆（上限 1000）",
      "建立分派預覽",
    ]);
  });
});

describe("sponsorship copy", () => {
  test("the English halves have no Chinese", () => {
    expectNoChineseInCopy(pledgeLaneCopy.en);
    expectNoChineseInCopy(pledgeDrawerCopy.en);
    expectNoChineseInCopy(reminderDraftCopy.en);
    expectNoChineseInCopy(followupBulkCopy.en);
    expectNoChineseInCopy(sponsorshipFormatCopy.en);
    // receiptsLine takes a list, which the sample arguments of expectNoChineseInCopy are not.
    const { receiptsLine, ...rest } = financeCopy.en;
    expectNoChineseInCopy(rest);
    expectNoChineseText(receiptsLine([{ number: "R-1", issued: true }]));
  });

  test("every English error says what to do next", () => {
    const pageErrors = adminPageCopy.en.pledgeReview.errors;
    const errors = [
      ...Object.values(pledgeLaneCopy.en.errors),
      ...Object.values(financeCopy.en.errors),
      ...Object.values(followupBulkCopy.en.errors),
      ...Object.values(pledgeDrawerCopy.en.proofFileErrors),
      // The drawer's action errors, apart from the notice-like follow-up one.
      pageErrors.review,
      pageErrors.assignAnimal,
      pageErrors.endAssignment,
      pageErrors.proofReviewChanged,
      pageErrors.cancel,
      pageErrors.recordPayment,
      reminderDraftCopy.en.failed,
      financeCopy.en.loadFailed,
      ...Object.values(reminderDraftCopy.en.unavailable),
    ];
    for (const message of errors) {
      expect(message, message).toMatch(
        /(Try again|try again|Refresh|Reload|Select the pledges again|Narrow the filters|Clear some|Choose another file|Upload a |Check |Verify |Ask finance|Finish the review|no draft is needed)/,
      );
    }
  });

  test("the drawer's error codes: Chinese keeps its text, English names what failed", () => {
    const zh = adminPageCopy.zh.pledgeReview.errors;
    const en = adminPageCopy.en.pledgeReview.errors;
    // Adding an animal and ending a sponsorship have always shown the review text in Chinese.
    expect(zh.review).toBe("審核失敗");
    expect(zh.assignAnimal).toBe("審核失敗");
    expect(zh.endAssignment).toBe("審核失敗");
    expect(zh.proofReviewChanged).toBe("付款證明或審批資料已更新，請重新載入。");
    expect(en.review).toBe("Could not review the payment proof. Refresh the page and try again.");
    expect(en.assignAnimal).toBe("Could not add the animal. Check the animal UUID and try again.");
    expect(en.endAssignment).toBe("Could not end the sponsorship. Refresh the page and try again.");
    expect(en.proofReviewChanged).toBe(
      "The payment proof or review changed. Reload the pledge and review it again.",
    );
    expect(en.assignAnimal).not.toContain("review");
    expect(en.endAssignment).not.toContain("review");
  });

  test("a file with no content is named in English; Chinese keeps its text", () => {
    expect(pledgeDrawerCopy.en.proofFileErrors.too_large).toBe(
      "The file is empty or larger than the 8MB limit. Choose another file.",
    );
    expect(pledgeDrawerCopy.zh.proofFileErrors.too_large).toBe("檔案大小超過上限（8MB）");
  });

  test("the tier amount is written as money in English", () => {
    expect(pledgeDrawerCopy.en.tierAmount("300")).toBe("HK$300.00 tier");
    expect(pledgeDrawerCopy.en.tierAmount("500")).toBe("HK$500.00 tier");
    expect(pledgeDrawerCopy.en.tierAmount("custom")).toBe("custom");
    expect(pledgeDrawerCopy.zh.tierAmount("300")).toBe("300");
  });

  test("an English month is read from the text, so no time zone can move it", () => {
    const names = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const { month, periodStart } = sponsorshipFormatCopy.en;
    names.forEach((name, index) => {
      const mm = String(index + 1).padStart(2, "0");
      expect(month(`2026-${mm}`), name).toBe(`${name} 2026`);
      expect(month(`2026-${mm}-01`), name).toBe(`${name} 2026`);
      expect(periodStart(`2026-${mm}-01`), name).toBe(`${name} 2026`);
    });
    // The two months a time zone shift would move: the first of January and the end of December.
    expect(month("2026-01-01")).toBe("Jan 2026");
    expect(month("2025-12-31")).toBe("Dec 2025");
    expect(month("2025-12-01")).toBe("Dec 2025");
    // Not a month: shown as its first seven characters, as Chinese shows every month.
    expect(month("2026-13-01")).toBe("2026-13");
    expect(month("")).toBe("");
    // Chinese is unchanged.
    expect(sponsorshipFormatCopy.zh.month("2026-01-01")).toBe("2026-01");
    expect(sponsorshipFormatCopy.zh.month("2025-12-31")).toBe("2025-12");
  });

  test("a count of one reads as singular", () => {
    expect(followupBulkCopy.en.reviewTitle("staff@example.org", 1)).toBe(
      "Follow-up owner: staff@example.org · 1 pledge",
    );
    expect(followupBulkCopy.en.reviewTitle("staff@example.org", 3)).toBe(
      "Follow-up owner: staff@example.org · 3 pledges",
    );
    expect(followupBulkCopy.en.selectedCount(1200)).toBe("1,200 selected (maximum 1,000)");
    expect(financeCopy.en.deliveryLine("A", "B", "C", 1)).toBe("A · B · C · Tried 1 time");
    expect(financeCopy.en.deliveryLine("A", "B", "C", 2)).toBe("A · B · C · Tried 2 times");
    // Chinese has no plural.
    expect(financeCopy.zh.deliveryLine("A", "B", "C", 1)).toBe("A · B · C · 嘗試 1 次");
  });

  test("amounts and dates: Chinese keeps what it showed, English uses the admin formats", () => {
    const zh = sponsorshipFormatCopy.zh;
    const en = sponsorshipFormatCopy.en;
    expect(zh.money(12345)).toBe("HK$123.45");
    expect(zh.money(30000)).toBe("HK$300");
    expect(en.money(30000)).toBe("HK$300.00");
    expect(zh.monthly(30000)).toBe("HK$300/月");
    expect(en.monthly(30000)).toBe("HK$300.00/month");
    expect(zh.date("2026-08-01T02:30:00Z")).toBe("2026-08-01");
    expect(en.date("2026-08-01T02:30:00Z")).toBe("1 Aug 2026 (Sat)");
    expect(zh.date(null)).toBe("-");
    expect(en.date("  ")).toBe("-");
    expect(zh.day("2026-08-02")).toBe("2026-08-02");
    expect(en.day("2026-08-02")).toBe("2 Aug 2026 (Sun)");
    expect(zh.isoDay("2026-08-31T02:30:00Z")).toBe("2026-08-31");
    expect(zh.isoDay(null)).toBe("");
    expect(en.isoDay(null)).toBe("");
    expect(zh.periodStart("2026-08-01")).toBe("2026-08-01");
    expect(en.periodStart("2026-08-01")).toBe("Aug 2026");
    expect(zh.month("2026-08-01")).toBe("2026-08");
    expect(zh.dateTime("2026-09-28T02:00:00.000Z")).toBe("2026-09-28T02:00:00.000Z");
    expect(en.dateTime("2026-09-28T02:00:00.000Z")).toBe("28 Sep 2026 (Mon) 10:00");
  });

  test("a stored payment method or activity code is a word in English and the code in Chinese", () => {
    expect(pledgeDrawerCopy.zh.paymentMethodName("bank_transfer")).toBe("bank_transfer");
    expect(pledgeDrawerCopy.en.paymentMethodName("bank_transfer")).toBe("Bank transfer");
    expect(pledgeDrawerCopy.en.paymentMethodName("cheque_deposit")).toBe("Cheque deposit");
    expect(pledgeDrawerCopy.zh.auditAction("sponsorship_pledge.cancelled")).toBe(
      "sponsorship_pledge.cancelled",
    );
    expect(pledgeDrawerCopy.en.auditAction("sponsorship_pledge.cancelled")).toBe(
      "Sponsorship cancelled",
    );
    expect(pledgeDrawerCopy.en.auditAction("sponsorship_pledge_status_update")).toBe(
      "Sponsorship pledge status update",
    );
  });

  test("the Chinese words that were in the components are unchanged", () => {
    expect(pledgeLaneCopy.zh.errors.select_failed).toBe("無法選取");
    expect(pledgeLaneCopy.zh.errors.pin_failed).toBe("無法固定選取範圍");
    expect(pledgeLaneCopy.zh.errors.filter_changed).toBe("篩選條件已變更；請重新選取");
    expect(pledgeLaneCopy.zh.errors.too_many).toBe("最多只能選取 1000 筆助養承諾");
    expect(pledgeDrawerCopy.zh.proofFileErrors.unsupported_type).toBe(
      "檔案格式不支援，請上載 JPG、PNG、WEBP 或 PDF 檔案",
    );
    expect(pledgeDrawerCopy.zh.proofFileErrors.too_large).toBe("檔案大小超過上限（8MB）");
    expect(followupBulkCopy.zh.errors.preview_failed).toBe("無法建立預覽");
    expect(followupBulkCopy.zh.errors.apply_failed).toBe("無法套用；請重新讀取結果");
    expect(financeCopy.zh.errors.command_failed).toBe("未能完成操作");
    expect(financeCopy.zh.errors.retry_failed).toBe("通知重試失敗");
    expect(financeCopy.zh.receiptsLine([])).toBe("收據：未簽發");
    expect(
      financeCopy.zh.receiptsLine([
        { number: "R-1", issued: true },
        { number: "R-2", issued: false },
      ]),
    ).toBe("收據：R-1（已簽發）、R-2（已作廢）");
  });
});
