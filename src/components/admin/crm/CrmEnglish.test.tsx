import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

import { AdminSessionError } from "../../../lib/admin/session";
import type {
  SupporterDetail as SupporterDetailData,
  SupporterSummary,
} from "../../../lib/crm/types";
import { adminPageCopy } from "../adminPageCopy";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realRouter = await import("@tanstack/react-router");
const realQuery = await import("@tanstack/react-query");

mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({
    children,
    className,
    to,
    params,
  }: {
    children?: ReactNode;
    className?: string;
    to: string;
    params?: Record<string, string>;
  }) => {
    const href = params
      ? Object.entries(params).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
      : to;
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
}));

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

const { SupporterList } = await import("./SupporterList");
const { SupporterDetail } = await import("./SupporterDetail");
const { SupporterFormDialog } = await import("./SupporterFormDialog");
const { ManualDonationDialog } = await import("./ManualDonationDialog");
const { ManualGiftOutcome } = await import("./ManualGiftOutcome");
const { DonationDeliveryAction } = await import("./DonationDeliveryAction");
const { ExportBarView } = await import("./ExportBar");
const { SupporterTimeline } = await import("./SupporterTimeline");
const { SupporterProfileSidebar } = await import("./SupporterProfileSidebar");
const { SupporterActivitySummary } = await import("./SupporterActivitySummary");
const copyModule = await import("./copy");
const { crmFormatCopy } = await import("./formatCopy");
const { exportCopy } = await import("./exportCopy");
const { supporterFormCopy, manualDonationCopy, manualGiftOutcomeCopy } = await import("./formCopy");
const { tagBulkCopy, supporterAssignmentCopy, contactFormatCopy } = await import("./bulkCopy");
const { supporterProfileCopy, consentEditorCopy, donationDeliveryActionCopy } =
  await import("./profileCopy");

const summaries: SupporterSummary[] = [
  {
    id: "sup-1",
    name: "陳大文",
    email: "chan@example.org",
    phone: "9123 4567",
    language: "zh-HK",
    tags: ["旺角街站"],
    roles: ["donor", "adopter"],
    deletedAt: null,
    lastGiftAt: "2026-10-01T02:30:00Z",
    lastGiftAmountCents: 50050,
    lifetimeAmountCents: 123400,
    donationCount: 2,
    receiptNeeded: true,
    emailConsent: "opt_in",
    whatsappConsent: "opt_out",
  },
  {
    id: "sup-2",
    name: "Ada Wong",
    email: "ada@example.org",
    phone: null,
    language: "en",
    tags: [],
    roles: [],
    deletedAt: null,
    lastGiftAt: null,
    lastGiftAmountCents: null,
    lifetimeAmountCents: 0,
    donationCount: 0,
    receiptNeeded: false,
    emailConsent: null,
    whatsappConsent: null,
  },
];

const detail: SupporterDetailData = {
  ...summaries[0]!,
  roles: ["donor", "adopter", "foster"],
  tags: ["旺角街站", "VIP"],
  source: "admin_manual",
  createdAt: "2026-06-01T10:00:00Z",
  updatedAt: "2026-10-01T02:30:00Z",
  editVersion: 4,
  donations: [
    {
      id: "d-1",
      amountCents: 50050,
      refundedCents: 10000,
      currency: "HKD",
      purpose: "general",
      customPurpose: "婚宴回禮",
      status: "succeeded",
      method: "fps",
      receiptRequested: true,
      createdAt: "2026-10-01T02:30:00Z",
      deliveryJob: { id: "job-1", status: "attention_required" },
    },
    {
      id: "d-2",
      amountCents: 100000,
      currency: "HKD",
      purpose: "medical",
      customPurpose: null,
      status: "pending",
      method: "paypal",
      receiptRequested: false,
      createdAt: "2026-09-20T02:30:00Z",
    },
  ],
  payments: [
    {
      id: "p-1",
      donationId: "d-2",
      provider: "paypal",
      providerRef: null,
      amountCents: 100000,
      status: "pending",
      receivedAt: null,
      bankReference: null,
      createdAt: "2026-09-20T02:30:00Z",
    },
  ],
  receipts: [
    {
      id: "r-1",
      receiptNo: "HKSCDA-2026-000001",
      donationIds: ["d-0"],
      totalAmountCents: 20000,
      issuedAt: "2026-09-01T02:30:00Z",
      status: "issued",
      pdfUrl: null,
    },
    {
      id: "r-2",
      receiptNo: "HKSCDA-2026-000002",
      donationIds: ["d-9"],
      totalAmountCents: 30000,
      issuedAt: "2026-08-01T02:30:00Z",
      status: "void",
      pdfUrl: null,
    },
  ],
  consents: [],
  messages: [],
  auditLogs: [],
  volunteer: { registrations: [] },
  adoption: {
    profiles: [
      {
        id: "profile-1",
        displayName: "陳大文 / Chan Tai Man",
        email: "chan@example.org",
        phone: "9123 4567",
        livingArea: "九龍",
        isBlacklisted: false,
        birthday: null,
        address: null,
        householdSize: null,
        blacklistReason: null,
        createdAt: "2026-06-01T10:00:00Z",
        updatedAt: "2026-06-02T10:00:00Z",
      },
    ],
    cases: [],
    followups: [],
    successfulAdoptions: [],
  },
  timeline: [
    {
      id: "message:m1",
      at: "2026-10-03T02:30:00Z",
      kind: "message",
      title: "email message sent",
      description: "Receipt · 退信：需要跟進",
      status: "sent",
      subject: "Receipt",
      deliveryState: "bounced",
    },
    {
      id: "donation:d-1",
      at: "2026-10-01T02:30:00Z",
      kind: "donation",
      title: "Donation succeeded",
      description: "general via fps",
      amountCents: 50050,
      status: "succeeded",
    },
    {
      id: "consent:c1",
      at: "2026-09-25T02:30:00Z",
      kind: "consent",
      title: "email consent opt_in",
      description: "Source: admin_manual",
      status: "opt_in",
    },
    {
      id: "volunteer_registration:v1:submitted",
      at: "2026-09-20T02:30:00Z",
      kind: "volunteer_registration",
      title: "Volunteer registration submitted: 清潔日",
      description: "2 people · waitlisted",
      status: "waitlisted",
      link: { to: "/admin/volunteers/registrations/$id", params: { id: "v1" } },
    },
    {
      id: "receipt:r-2",
      at: "2026-08-01T02:30:00Z",
      kind: "receipt",
      title: "Receipt HKSCDA-2026-000002",
      description: "void HK$300.00",
      amountCents: 30000,
      status: "void",
    },
  ],
};

// Names, tags and notes that staff or supporters typed are data, so they stay as they were.
const FIXTURE_TEXT = ["陳大文", "旺角街站", "婚宴回禮", "清潔日", "九龍"];

describe("supporter list in English", () => {
  const load = (total = 2, role = "admin") => {
    queries = {
      "admin-me": { data: { admin: { authUserId: "fixture-finance", status: "active", role } } },
      "crm-supporters": { data: { supporters: summaries, total } },
    };
  };

  test("shows the title, the controls, the columns and the rows without Chinese", () => {
    load();
    const markup = renderAdminInEnglish(<SupporterList />);
    expectNoChineseText(markup, { allow: FIXTURE_TEXT });
    for (const text of [
      ">Supporters<",
      "Donor records, receipts, consent and manual donations.",
      'aria-label="Search supporters"',
      "Search name, email, phone, reference or receipt",
      ">Select<",
      ">Supporter<",
      ">Roles<",
      ">Consent<",
      ">Lifetime<",
      ">Last donation<",
      ">Receipts<",
      "Needs review",
      "Select this page",
      "Select all matching supporters (up to 1,000)",
      "Clear selection",
      'aria-label="Select 陳大文"',
      "Email Opted in / WhatsApp Opted out",
      "Email - / WhatsApp -",
      "HK$1,234.00",
      "HK$500.50",
      "HK$0.00",
      "Donor",
      "Adopter",
      "Supporters CSV",
      "Donations CSV",
      "New supporter",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("shows the three bulk panels, with the follow-up owner panel for finance staff", () => {
    load();
    const markup = renderAdminInEnglish(<SupporterList />);
    expectNoChineseText(markup, { allow: FIXTURE_TEXT });
    for (const text of [
      'aria-label="Bulk tag action for supporters"',
      "Bulk add a supporter tag",
      "Tag to add",
      "0 selected (maximum 1,000)",
      "Preview changes",
      'aria-label="Bulk follow-up owner action for supporters"',
      "Bulk assign follow-up owners",
      "Choose a staff member",
      "Preview assignment",
      'aria-label="Contact format preview for supporters"',
      "Contact format clean-up preview",
      "Preview format suggestions",
    ]) {
      expect(markup, text).toContain(text);
    }
    load(2, "staff");
    expect(renderAdminInEnglish(<SupporterList />)).not.toContain("Bulk assign follow-up owners");
  });

  test("counts the supporters with a singular for one and a plural for the rest", () => {
    load(1);
    expect(renderAdminInEnglish(<SupporterList />)).toContain(">1 supporter<");
    load(3);
    const three = renderAdminInEnglish(<SupporterList />);
    expect(three).toContain(">3 supporters<");
    expect(three).not.toContain("3 supporter<");
    expect(adminPageCopy.en.common.totalSupporters(1)).toBe("1 supporter");
    expect(adminPageCopy.en.common.totalSupporters(3)).toBe("3 supporters");
  });

  test("shows the failure and the empty states in English", () => {
    queries = {
      "admin-me": { data: { admin: { authUserId: "x", status: "active", role: "staff" } } },
      "crm-supporters": { data: undefined, error: new Error("boom") },
    };
    const failed = renderAdminInEnglish(<SupporterList />);
    expectNoChineseText(failed);
    expect(failed).toContain("Could not load supporters. Refresh the page or try again.");
    expect(failed).not.toContain("No supporters found");
    queries["crm-supporters"] = { data: { supporters: [], total: 0 } };
    const empty = renderAdminInEnglish(<SupporterList />);
    expectNoChineseText(empty);
    expect(empty).toContain("No supporters found");
  });

  test("keeps the Chinese list as it was", () => {
    load();
    const markup = renderAdminInChinese(<SupporterList />);
    for (const text of [
      "選取本頁",
      "選取全部符合條件（最多 1000 筆）",
      "清除選取",
      'aria-label="選取 陳大文"',
      "批量加入支持者標籤",
      "已選 0 筆（上限 1000）",
      "批量指派跟進負責人",
      "聯絡資料格式整理預覽",
      "電郵 opt_in / WhatsApp opt_out",
      "HK$1,234.00",
      // The Chinese list keeps the cents, as English does.
      "HK$500.50",
      "共 2 位支持者",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("HK$501");
  });
});

describe("supporter detail in English", () => {
  const load = (override: Partial<SupporterDetailData> = {}) => {
    queries = { "crm-supporter": { data: { ...detail, ...override } } };
  };

  test("shows every section without Chinese except what staff typed", () => {
    load();
    const markup = renderAdminInEnglish(<SupporterDetail supporterId="sup-1" />);
    expectNoChineseText(markup, { allow: [...FIXTURE_TEXT, "陳大文 / Chan Tai Man"] });
    for (const text of [
      // The sidebar.
      "Supporter profile",
      ">Contact<",
      "Opted in",
      "Not set",
      ">Source<",
      "1 Jun 2026 (Mon) 18:00",
      "1 Oct 2026 (Thu) 10:30",
      "Traditional Chinese",
      ">Tags<",
      "Adoption links",
      "Primary adopter profile",
      // The counters.
      "Lifetime donations",
      "HK$1,234.00",
      "Pending payments",
      "Open follow-ups",
      "Successful adoptions",
      // The consent editor.
      "Update whether this supporter agrees to be contacted.",
      "Receipt updates",
      "Payment updates",
      'aria-label="Save consent settings"',
      'aria-label="Email consent"',
      // The timeline.
      ">Timeline<",
      "Newest activity first.",
      ">Communication<",
      ">Follow-ups<",
      "Receipt · Bounced: follow up",
      "Volunteer registration",
      "Waitlisted",
      "Opted in",
      "Voided",
      // The donations.
      "Donation history and receipt actions.",
      "Refunded HK$100.00 · Net received HK$400.50",
      "Other purpose: 婚宴回禮",
      "FPS · Succeeded · 1 Oct 2026 (Thu)",
      "PayPal · Pending · 20 Sep 2026 (Sun)",
      "receipt requested",
      "Issue receipt",
      "Retry receipt and acknowledgement email",
      "Check the email and service settings first",
      "Medical",
      // The receipts.
      "Issued and voided receipts.",
      "HKSCDA-2026-000001",
      "Issued · HK$200.00 · 1 Sep 2026 (Tue)",
      "Voided · HK$300.00 · 1 Aug 2026 (Sat)",
      ">Void<",
      // The dialogs.
      "Edit supporter",
      "Manual donation",
      "Amount (HK$)",
      "Save manual donation",
    ]) {
      expect(markup, text).toContain(text);
    }
    // The server wrote the delivery state in Chinese; English writes it itself.
    expect(markup).not.toContain("退信");
  });

  test("shows an empty supporter in English", () => {
    load({
      tags: [],
      donations: [],
      receipts: [],
      timeline: [],
      adoption: { profiles: [], cases: [], followups: [], successfulAdoptions: [] },
    });
    const markup = renderAdminInEnglish(<SupporterDetail supporterId="sup-1" />);
    expectNoChineseText(markup, { allow: ["陳大文"] });
    for (const text of [
      "No donations yet.",
      "No receipts yet.",
      "No timeline activity yet.",
      "No tags",
      "No linked adoption history.",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("keeps the Chinese detail, dates and amounts as they were", () => {
    load();
    const markup = renderAdminInChinese(<SupporterDetail supporterId="sup-1" />);
    for (const text of [
      "支持者資料",
      "累計捐款",
      "HK$1,234.00",
      "更新捐款人通訊的同意狀態。",
      "已退款 HK$100.00 · 實收 HK$400.50",
      "其他用途：婚宴回禮",
      "需要收據",
      "發出收據",
      "重試收據及確認電郵",
      "時間軸",
      "最新活動排最前。",
      // The server's own description, with the delivery label it wrote.
      "Receipt · 退信：需要跟進",
      "手動捐款",
      "儲存手動捐款",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("HK$401");
  });
});

describe("the supporter timeline", () => {
  test("shows a message's delivery state in the screen's language", () => {
    const items = detail.timeline.filter((item) => item.kind === "message");
    const english = renderAdminInEnglish(<SupporterTimeline items={items} />);
    expectNoChineseText(english);
    expect(english).toContain("Receipt · Bounced: follow up");
    const chinese = renderAdminInChinese(<SupporterTimeline items={items} />);
    expect(chinese).toContain("Receipt · 退信：需要跟進");
  });

  test("shows a message with no delivery state, and an older item without the new fields", () => {
    const plain = {
      id: "message:m2",
      at: "2026-10-03T02:30:00Z",
      kind: "message" as const,
      title: "email message queued",
      description: "Receipt",
      status: "queued",
      subject: "Receipt",
    };
    const old = { ...plain, id: "message:m3", description: "Receipt · 退信：需要跟進" };
    delete (old as { subject?: string }).subject;
    const english = renderAdminInEnglish(<SupporterTimeline items={[plain, old]} />);
    expect(english).toContain(">Receipt<");
    expect(english).toContain("Queued");
    // An item from a server that does not send the new fields is shown as it came.
    expect(english).toContain("Receipt · 退信：需要跟進");
  });

  test("writes a status or a kind that has no name in plain English", () => {
    expect(copyModule.crmLabelCopy.en.status("no_show")).toBe("No show");
    expect(copyModule.crmLabelCopy.en.status("custom_state")).toBe("Custom state");
    expect(copyModule.timelineCopy.en.kind("volunteer_registration")).toBe(
      "Volunteer registration",
    );
    // Chinese shows such a code as it is, as it always has.
    expect(copyModule.crmLabelCopy.zh.status("no_show")).toBe("no_show");
    expect(copyModule.crmLabelCopy.zh.status("void")).toBe("void");
    expect(copyModule.timelineCopy.zh.kind("volunteer_registration")).toBe(
      "volunteer_registration",
    );
    expect(copyModule.crmLabelCopy.zh.status("voided")).toBe("已作廢");
  });
});

describe("the supporter sidebar and counters in English", () => {
  test("shows the profile in English from the language it is given", () => {
    const markup = renderAdminInEnglish(
      <SupporterProfileSidebar
        supporter={detail}
        language="en"
        roleLabels={{
          donor: "Donor",
          adopter: "Adopter",
          volunteer: "Volunteer",
          foster: "Foster",
        }}
      />,
    );
    expectNoChineseText(markup, { allow: FIXTURE_TEXT.concat("陳大文 / Chan Tai Man") });
    expect(markup).toContain("Supporter profile");
    expect(markup).toContain("2 Jun 2026 (Tue) 18:00");
  });

  test("shows the counters with the English amount", () => {
    const markup = renderAdminInEnglish(
      <SupporterActivitySummary
        language="en"
        lifetimeAmountCents={123400}
        donationCount={1234}
        receiptCount={2}
        pendingPaymentCount={1}
        adoptionCaseCount={3}
        openFollowupCount={2}
        successfulAdoptionCount={1}
      />,
    );
    expectNoChineseText(markup);
    expect(markup).toContain("HK$1,234.00");
    expect(markup).toContain(">1,234<");
  });
});

describe("supporter dialogs in English", () => {
  test("shows the supporter form dialog's trigger and title in each mode", () => {
    const create = renderAdminInEnglish(<SupporterFormDialog mode="create" />);
    expectNoChineseText(create);
    expect(create).toContain("New supporter");
    const edit = renderAdminInEnglish(
      <SupporterFormDialog mode="edit" supporter={summaries[1]!} />,
    );
    expectNoChineseText(edit);
    expect(edit).toContain("Edit supporter");
  });

  test("shows the manual donation form in English", () => {
    const markup = renderAdminInEnglish(<ManualDonationDialog supporterId="sup-1" />);
    expectNoChineseText(markup);
    for (const text of [
      ">Manual donation<",
      ">Amount (HK$)<",
      ">Purpose<",
      ">Method<",
      ">Payment status<",
      ">Bank reference<",
      'placeholder="Optional"',
      ">Receipt requested<",
      'aria-label="Donation purpose"',
      'aria-label="Payment method"',
      ">Save manual donation<",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("keeps the Chinese manual donation form as it was", () => {
    const markup = renderAdminInChinese(<ManualDonationDialog supporterId="sup-1" />);
    for (const text of [
      ">手動捐款<",
      ">金額 HKD<",
      ">銀行參考編號<",
      'placeholder="選填"',
      ">儲存手動捐款<",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("shows the outcome of a saved donation in English, with a retry only when one is due", () => {
    const outcome = (deliveryStatus: "retryable" | "complete" | "not_required", error?: unknown) =>
      renderAdminInEnglish(
        <ManualGiftOutcome
          language="en"
          donationId="gift-1"
          deliveryStatus={deliveryStatus}
          retrying={false}
          error={error}
          onRetry={() => {}}
          onDone={() => {}}
        />,
      );
    const pending = outcome("retryable");
    expectNoChineseText(pending);
    for (const text of [
      "Donation recorded",
      "Reference: gift-1",
      "You can retry, and it will not create another donation.",
      "Retry receipt and acknowledgement email",
      ">Close<",
    ]) {
      expect(pending, text).toContain(text);
    }
    const complete = outcome("complete");
    expect(complete).toContain("The receipt is done");
    expect(complete).not.toContain("Retry receipt");
    expect(outcome("not_required")).toContain("The payment is still pending");
    // A missing session reads in the screen's language, and any other error as it came.
    expect(outcome("retryable", new AdminSessionError("not_signed_in"))).toContain(
      "Not signed in. Sign in again.",
    );
    expect(outcome("retryable", new Error("Gateway timeout"))).toContain("Gateway timeout");
  });

  test("keeps the Chinese outcome as it was", () => {
    const markup = renderAdminInChinese(
      <ManualGiftOutcome
        language="zh"
        donationId="gift-1"
        deliveryStatus="retryable"
        retrying={false}
        error={new AdminSessionError("not_signed_in")}
        onRetry={() => {}}
        onDone={() => {}}
      />,
    );
    for (const text of [
      "捐款已儲存",
      "參考編號：gift-1",
      "您可重試，不會新增捐款。",
      "未登入",
      "完成",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("shows the retry control beside a donation in English", () => {
    const retry = renderAdminInEnglish(
      <DonationDeliveryAction
        supporterId="sup-1"
        language="en"
        job={{ id: "job-1", status: "attention_required" }}
      />,
    );
    expectNoChineseText(retry);
    expect(retry).toContain("Retry receipt and acknowledgement email");
    expect(retry).toContain("Check the email and service settings first");
    const done = renderAdminInEnglish(
      <DonationDeliveryAction
        supporterId="sup-1"
        language="en"
        job={{ id: "job-1", status: "complete" }}
      />,
    );
    expect(done).toContain("The email provider accepted the acknowledgement email");
  });
});

describe("the export bar in English", () => {
  const viewCopy = (language: "zh" | "en") => ({
    supportersCsv: adminPageCopy[language].common.supportersCsv,
    donationsCsv: adminPageCopy[language].common.donationsCsv,
    exporting: adminPageCopy[language].common.exporting,
    retry: exportCopy[language].retry,
    downloaded: exportCopy[language].downloaded,
    backgroundExport: exportCopy[language].backgroundExport,
    failure: exportCopy[language].failure,
  });
  const overLimit = {
    phase: "error" as const,
    kind: "supporters" as const,
    snapshot: "q=Ada",
    failure: { code: "immediate_limit" as const, total: 5001 },
    overLimit: true,
  };
  const view = (language: "zh" | "en", state: Parameters<typeof ExportBarView>[0]["state"]) =>
    (language === "en" ? renderAdminInEnglish : renderAdminInChinese)(
      <ExportBarView
        copy={viewCopy(language)}
        state={state}
        onExport={() => {}}
        onRetry={() => {}}
        onBackground={() => {}}
      />,
    );

  test("shows the buttons, a failure with what to do next, and the retry controls", () => {
    const idle = view("en", { phase: "idle" });
    expectNoChineseText(idle);
    expect(idle).toContain("Supporters CSV");
    expect(idle).toContain("Donations CSV");
    const failed = view("en", overLimit);
    expectNoChineseText(failed);
    for (const text of [
      "5,001 matching rows exceed the immediate export limit of 5,000. Narrow the filters and try again, or create a background export.",
      "Retry with the same filters",
      "Create background export",
    ]) {
      expect(failed, text).toContain(text);
    }
    expect(view("en", { phase: "exporting", kind: "donations", snapshot: "" })).toContain(
      "Exporting...",
    );
    expect(view("en", { phase: "success", kind: "donations" })).toContain("Download started.");
  });

  test("a failure kept in state reads in whichever language is shown", () => {
    // The state holds a code, so the same state is written again after a language change.
    expect(view("zh", overLimit)).toContain(
      "符合 5,001 筆資料超過 5,000 筆即時匯出上限。請縮小篩選後重試；或建立背景匯出。",
    );
    expect(view("en", overLimit)).toContain("5,001 matching rows exceed");
  });

  test("a missing session shows the next step in both languages", () => {
    const state = {
      phase: "error" as const,
      kind: "supporters" as const,
      snapshot: "",
      failure: { code: "sign_in_required" as const },
    };
    expect(view("en", state)).toContain("Sign in before exporting.");
    expect(view("zh", state)).toContain("請登入後再試。");
  });

  test("every failure and background message is written in English without Chinese", () => {
    const failures = [
      { code: "session_expired" },
      { code: "forbidden" },
      { code: "immediate_limit", total: 5001 },
      { code: "immediate_limit", total: null },
      { code: "background_limit" },
      { code: "server_error" },
      { code: "incomplete" },
      { code: "sign_in_required" },
      { code: "network" },
      { code: "background_failed" },
      { code: "progress_failed" },
      { code: "create_failed" },
      { code: "create_failed", detail: "Gateway timeout" },
      { code: "not_signed_in" },
      { code: "cancel_failed" },
      { code: "download_failed" },
    ] as const;
    const messages = failures.map((failure) => exportCopy.en.failure(failure));
    expectNoChineseText(messages.join("\n"));
    expect(messages.every((message) => message.length > 10)).toBe(true);
    expect(exportCopy.en.failure({ code: "immediate_limit", total: null })).toBe(
      "The matching rows exceed the immediate export limit of 5,000. Narrow the filters and try again, or create a background export.",
    );
    expect(exportCopy.en.progress(3, 10, false)).toBe(
      "Background export: 3 of 10 rows. Processing.",
    );
    // Both counts group thousands the same way.
    expect(exportCopy.en.progress(12000, 15000, false)).toBe(
      "Background export: 12,000 of 15,000 rows. Processing.",
    );
    // A refusal says what to do next.
    expect(exportCopy.en.failure({ code: "forbidden" })).toBe(
      "You do not have permission to export this data. Ask an administrator to check your role.",
    );
    expect(exportCopy.en.progress(1, 1, true)).toBe(
      "Background export: 1 of 1 row. Ready to download.",
    );
    expect(exportCopy.zh.progress(3, 10, true)).toBe("背景匯出：3/10 筆；可下載");
    expect(exportCopy.zh.progress(3, 10, false)).toBe("背景匯出：3/10 筆；處理中");
    expectNoChineseInCopy({ ...exportCopy.en, failure: undefined });
  });
});

describe("the supporter copy modules", () => {
  /** A copy half without the entries that need a list or an object to call. */
  const without = (half: object, ...keys: string[]) =>
    Object.fromEntries(Object.entries(half).filter(([key]) => !keys.includes(key)));

  test("have no Chinese in English", () => {
    expectNoChineseInCopy(copyModule.supporterListCopy.en);
    expectNoChineseInCopy(copyModule.crmLabelCopy.en);
    expectNoChineseInCopy(copyModule.supporterDetailCopy.en);
    expectNoChineseInCopy(copyModule.activitySummaryCopy.en);
    expectNoChineseInCopy(copyModule.timelineCopy.en);
    expectNoChineseInCopy(supporterProfileCopy.en);
    expectNoChineseInCopy(consentEditorCopy.en);
    expectNoChineseInCopy(donationDeliveryActionCopy.en);
    expectNoChineseInCopy(supporterFormCopy.en);
    expectNoChineseInCopy(manualDonationCopy.en);
    expectNoChineseInCopy(manualGiftOutcomeCopy.en);
    expectNoChineseInCopy(without(tagBulkCopy.en, "joinTags"));
    expectNoChineseInCopy(supporterAssignmentCopy.en);
    expectNoChineseInCopy(contactFormatCopy.en);
  });

  test("keep the Chinese words and the whitespace they always had", () => {
    expect(copyModule.supporterListCopy.zh.selectSupporter("陳大文")).toBe("選取 陳大文");
    expect(copyModule.supporterDetailCopy.zh.customPurposeLine("婚宴回禮")).toBe(
      "其他用途：婚宴回禮",
    );
    expect(supporterFormCopy.zh.conflict).toBe(
      "資料已由其他職員更新。你的修改尚未儲存；請重新載入最新版本再編輯。",
    );
    expect(tagBulkCopy.zh.reviewTitle("VIP", 3)).toBe("標籤：VIP · 3 筆");
    expect(tagBulkCopy.zh.joinTags(["a", "b"])).toBe("a、b");
    expect(tagBulkCopy.en.joinTags(["a", "b"])).toBe("a, b");
    expect(supporterAssignmentCopy.zh.reviewTitle("a@example.org", 3)).toBe(
      "指派給：a@example.org · 3 筆",
    );
    expect(supporterAssignmentCopy.zh.ownerOption("a@example.org", "admin")).toBe(
      "a@example.org（admin）",
    );
    expect(supporterAssignmentCopy.zh.intro).toBe(
      "只更新 CRM 跟進負責人。先固定範圍並逐筆預覽，套用時重新核對職員權限及支持者版本；不會發送通知。",
    );
    expect(contactFormatCopy.zh.pageOf(2, 5)).toBe("第 2 / 5 頁");
  });

  test("give each bulk panel failure a message by its code, in both languages", () => {
    // The panels keep one of these codes (with the caught error, where the server gave a
    // reason) and look the message up when they render.
    expect(tagBulkCopy.zh.errors).toEqual({
      restore_failed: "未能讀取已保存的操作，請重新讀取結果。",
      reload_failed: "未能讀取已保存的操作，請稍後重新讀取結果。",
      preview_failed: "無法建立預覽",
      apply_failed: "無法套用；請重新讀取結果",
    });
    expect(supporterAssignmentCopy.zh.errors).toEqual({
      restore_failed: "未能讀取已保存的操作，請重新讀取結果。",
      reload_failed: "未能讀取結果；保留操作參考，請稍後再讀取。",
      preview_failed: "無法建立預覽",
      apply_unconfirmed: "操作回應未確認；先重新讀取已保存結果。",
      apply_result_unconfirmed: "操作結果未確認；保留操作參考，重新讀取成功前暫停套用。",
    });
    for (const messages of [tagBulkCopy.en.errors, supporterAssignmentCopy.en.errors]) {
      for (const message of Object.values(messages)) expect(message.length).toBeGreaterThan(20);
    }
  });

  test("write counts with a singular for one and a plural for the rest", () => {
    expect(tagBulkCopy.en.reviewTitle("VIP", 1)).toBe("Tag: VIP · 1 supporter");
    expect(tagBulkCopy.en.reviewTitle("VIP", 3)).toBe("Tag: VIP · 3 supporters");
    expect(supporterAssignmentCopy.en.reviewTitle("a@example.org", 1)).toBe(
      "Assigned to: a@example.org · 1 supporter",
    );
    expect(tagBulkCopy.en.selectedCount(1000)).toBe("1,000 selected (maximum 1,000)");
    expect(tagBulkCopy.zh.selectedCount(1000)).toBe("已選 1000 筆（上限 1000）");
  });

  test("format amounts and dates in the shared admin formats, with the cents kept", () => {
    const zh = crmFormatCopy.zh;
    const en = crmFormatCopy.en;
    expect(zh.money(123400)).toBe("HK$1,234.00");
    expect(zh.money(12345)).toBe("HK$123.45");
    expect(en.money(123400)).toBe("HK$1,234.00");
    expect(zh.money(null)).toBe("-");
    expect(en.money(undefined)).toBe("-");
    expect(en.date("2026-10-06T20:00:00Z")).toBe("7 Oct 2026 (Wed)");
    expect(en.date(null)).toBe("-");
    expect(zh.date(null)).toBe("-");
    expect(en.dateTime("2026-10-01T02:30:00Z")).toBe("1 Oct 2026 (Thu) 10:30");
    expect(en.dateTime("not a date")).toBe("not a date");
    expect(zh.dateTime(null)).toBe("-");
    expect(zh.dateTime("2026-10-01T02:30:00Z")).toBe("2026年10月1日 (四) 10:30");
    expect(zh.date("2026-10-06T20:00:00Z")).toBe("2026年10月7日 (三)");
  });
});
