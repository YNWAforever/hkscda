import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

import type { CoordinatorStatus, CoordinatorTask } from "../../../lib/adoptions/types";
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

// The profile dialog portals its content, which a static render does not mount, so the
// dialog primitives render in place.
mock.module("../../ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
    open ? <div data-dialog>{children}</div> : null,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
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

const { CaseList } = await import("./CaseList");
const { CaseDetail } = await import("./CaseDetail");
const { AdopterDetail } = await import("./AdopterDetail");
const { MatchPanel } = await import("./MatchPanel");
const { FinalizationPanel } = await import("./FinalizationPanel");
const { AnimalPipeline } = await import("./AnimalPipeline");
const { AnimalProfileDialog } = await import("./AnimalProfileDialog");
const { AdoptionAssignmentBulkPanel } = await import("./AdoptionAssignmentBulkPanel");
const copyModule = await import("./copy");
const { caseDetailCopy } = await import("./caseDetailCopy");
const { adopterDetailCopy } = await import("./adopterDetailCopy");
const { animalPipelineCopy } = await import("./animalPipelineCopy");
const { adoptionFormatCopy } = await import("./formatCopy");
const { intakeUrgencyLabel } = await import("./intakeInboxLogic");
const { bilingualStatusName } = await import("../adminPageCopy");
const { AdminSessionError } = await import("../../../lib/admin/session");
const { PipelineLookupError } = await import("./animalPipelineLogic");

const status = (overrides: Partial<CoordinatorStatus> = {}): CoordinatorStatus => ({
  id: "st-1",
  category: "adoption_case",
  key: "pending",
  labelZh: "待處理",
  labelEn: "Pending",
  sortOrder: 1,
  color: "blue",
  isActive: true,
  isSystem: true,
  isClosing: false,
  isFinal: false,
  ...overrides,
});
const matchStatus = status({
  id: "ms-1",
  category: "match",
  key: "proposed",
  labelZh: "建議",
  labelEn: "Proposed",
});
const approvedStatus = status({
  id: "ms-2",
  category: "match",
  key: "approved",
  labelZh: "已批核",
  labelEn: "Approved",
  isFinal: true,
});
const adoptedOutcome = status({
  id: "fo-1",
  category: "final_outcome",
  key: "adopted",
  labelZh: "已領養",
  labelEn: "Adopted",
  isFinal: true,
});
const followupStatus = status({
  id: "fu-1",
  category: "followup",
  key: "open",
  labelZh: "進行中",
  labelEn: "Open",
});
const statuses = [status(), matchStatus, approvedStatus, adoptedOutcome, followupStatus];

const task: CoordinatorTask = {
  id: "t-1",
  title: "致電申請人",
  status: followupStatus,
  taskType: "followup",
  priority: "high",
  dueAt: null,
  scheduledAt: null,
  completedAt: null,
  assignedTo: null,
  volunteer: "阿明",
  contactChannel: "phone",
  outcome: null,
  nextStepAt: null,
  remarks: "跟進備註",
  hasWindowNet: null,
  environment: null,
  score: null,
  createdAt: "2026-10-01T02:30:00Z",
  updatedAt: "2026-10-01T02:30:00Z",
  adoptionCase: null,
  adopterProfile: null,
  animal: null,
};

const caseSummary = {
  id: "c-1",
  applicantName: "陳大文",
  applicantPhone: "91234567",
  applicantEmail: "chan@example.org",
  animalType: "cat",
  requestedAnimalName: "小白",
  status: status(),
  createdAt: "2026-10-01T02:30:00Z",
  closedAt: null,
};

const publicAdoption = {
  language: "zh-HK",
  preferredContactMethod: "whatsapp",
  termsVersion: "2026-01",
  questionnaire: {
    contact: { phone: "91234567", ok: true },
    home: { type: "公屋", rooms: 2 },
    readiness: {},
  },
  animalPreferences: [
    { id: "p-1", rank: 1, animalId: "a-1", animalNameSnapshot: "小白", animalTypeSnapshot: "cat" },
  ],
  visitPreference: {
    dateRangeStart: "2026-10-10",
    dateRangeEnd: "2026-10-20",
    preferredTimeWindows: ["上午", "下午"],
    notes: "請先致電",
  },
  photos: [
    {
      id: "ph-1",
      publicApplicationId: "pa-1",
      fileName: "home.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      photoCategory: "home",
      uploadedAt: "2026-10-02T02:30:00Z",
    },
  ],
  statusToken: {
    expiresAt: "2026-11-01T00:00:00Z",
    revokedAt: null,
    lastViewedAt: "2026-10-05T00:00:00Z",
  },
};

const caseDetail = {
  ...caseSummary,
  applicantAddress: "九龍某處",
  housingType: "公屋",
  familySize: 3,
  existingPets: "一隻狗",
  reason: "想有個伴",
  supporterId: "sup-1",
  adopterProfileId: "ad-1",
  assessment: { home: "合格", score: 5, ok: true, list: ["a", "b"] },
  preferences: {},
  matches: [
    {
      id: "m-1",
      animalId: "a-1",
      animalName: "小白",
      status: approvedStatus,
      isApproved: true,
      notes: "配對備註",
    },
    {
      id: "m-2",
      animalId: "a-2",
      animalName: "阿黑",
      status: matchStatus,
      isApproved: false,
      notes: null,
    },
  ],
  followups: [task],
  successfulAdoption: {
    id: "sa-1",
    caseNumber: "HK-2026-001",
    animalId: "a-1",
    supporterId: "sup-1",
    adopterProfileId: "ad-1",
    adoptionFeeCents: 50050,
    approvalDate: "2026-10-03",
    pickupDate: "2026-10-05",
  },
  publicAdoption,
};

// Names, addresses and notes staff or applicants typed are data, so they stay as they were.
const CASE_FIXTURE_TEXT = [
  "陳大文",
  "小白",
  "阿黑",
  "九龍某處",
  "公屋",
  "一隻狗",
  "想有個伴",
  "合格",
  "配對備註",
  "上午",
  "下午",
  "請先致電",
  "致電申請人",
  "阿明",
  "跟進備註",
];

describe("case list in English", () => {
  const loaded = (role: "staff" | "admin") => {
    queries = {
      "admin-me": { data: { admin: { role } } },
      "coordinator-statuses": { data: { statuses } },
      "adoption-cases": {
        data: {
          cases: [
            caseSummary,
            {
              ...caseSummary,
              id: "c-2",
              applicantName: "李小明",
              requestedAnimalName: null,
              applicantEmail: null,
              status: status({ id: "st-2", labelEn: "", labelZh: "跟進中", color: "green" }),
            },
          ],
          total: 2,
        },
      },
      "admin-access-users": {
        data: {
          users: [
            { authUserId: "u1", email: "staff@example.org", role: "staff", status: "active" },
          ],
        },
      },
    };
  };
  const allowed = ["陳大文", "小白", "李小明", "跟進中"];

  test("shows the queue, the filters and the table without Chinese", () => {
    loaded("staff");
    const markup = renderAdminInEnglish(<CaseList />);
    expectNoChineseText(markup, { allow: allowed });
    for (const text of [
      "Adoption cases",
      "Coordinator queue, matching, follow-up and finalisation.",
      "Show open cases only",
      ">Applicant<",
      ">Requested animal<",
      ">Phone<",
      ">Created<",
      ">Status<",
      "1 Oct 2026 (Thu)",
      "Pending",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("Bulk assign case owners");
  });

  test("shows a coordinator status in English, and its Chinese label when label_en is empty", () => {
    loaded("staff");
    const markup = renderAdminInEnglish(<CaseList />);
    // labelEn "Pending" is shown instead of labelZh.
    expect(markup).toContain("Pending");
    expect(markup).not.toContain("待處理");
    // labelEn "" falls back to labelZh.
    expect(markup).toContain("跟進中");
  });

  test("shows administrators the bulk assignment panel in English", () => {
    loaded("admin");
    const markup = renderAdminInEnglish(<CaseList />);
    expectNoChineseText(markup, { allow: allowed });
    for (const text of [
      ">Select<",
      "Select this page",
      "Select all matching cases (up to 1,000)",
      "Clear selection",
      'aria-label="Bulk assignment of adoption cases"',
      "Bulk assign case owners",
      "Case owner",
      "Choose an active staff member",
      "Minimum waiting days",
      "0 selected (maximum 1,000)",
      "Preview assignment",
      'aria-label="Select 陳大文"',
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("shows the failure and the empty states in English", () => {
    loaded("staff");
    queries["adoption-cases"] = { data: undefined, error: new Error("boom") };
    queries["coordinator-statuses"] = { data: { statuses: [] }, error: new Error("statuses down") };
    const failed = renderAdminInEnglish(<CaseList />);
    expectNoChineseText(failed);
    expect(failed).toContain("Could not load");
    expect(failed).toContain("Could not load status filters: statuses down");

    queries["adoption-cases"] = { data: { cases: [], total: 0 } };
    queries["coordinator-statuses"] = { data: { statuses: [] } };
    const empty = renderAdminInEnglish(<CaseList />);
    expectNoChineseText(empty);
    expect(empty).toContain("No cases found");
  });

  test("keeps the Chinese case list as it was", () => {
    loaded("admin");
    const markup = renderAdminInChinese(<CaseList />);
    for (const text of [
      "領養個案",
      "選取本頁",
      "選取全部符合條件（最多 1000 筆）",
      "清除選取",
      "批量分派領養個案負責職員",
      "已選 0 筆（上限 1000）",
      "2026-10-01",
    ]) {
      expect(markup, text).toContain(text);
    }
    // The status badge shows the Chinese label first, as before.
    expect(markup).toContain("待處理");
    expect(markup).toContain('aria-label="選取 陳大文"');
  });

  test("the selection and assignment copy has no Chinese in English", () => {
    expectNoChineseInCopy(copyModule.caseSelectionCopy.en);
    expectNoChineseInCopy(copyModule.assignmentBulkCopy.en);
    expect(copyModule.assignmentBulkCopy.en.reviewTitle("a@example.org", 1)).toBe(
      "Case owner: a@example.org · 1 case",
    );
    expect(copyModule.assignmentBulkCopy.en.reviewTitle("a@example.org", 3)).toBe(
      "Case owner: a@example.org · 3 cases",
    );
    expect(copyModule.assignmentBulkCopy.zh.reviewTitle("a@example.org", 3)).toBe(
      "負責職員：a@example.org · 3 筆",
    );
    expect(copyModule.assignmentBulkCopy.zh.intro).toContain("預覽有效 15 分鐘，套用時");
  });
});

describe("bulk assignment panel in English", () => {
  const base = {
    selectedIds: ["c-1", "c-2"],
    filterKey: "k",
    selectionDisabled: false,
    statusId: "st-1",
    statusEligible: true,
    minAgeDays: 3,
    onMinAgeDaysChange: () => {},
  };

  test("shows the controls, the selection count and the staff load failure", () => {
    queries = {
      "admin-access-users": {
        data: {
          users: [
            { authUserId: "u1", email: "staff@example.org", role: "staff", status: "active" },
          ],
        },
      },
    };
    const eligible = renderAdminInEnglish(<AdoptionAssignmentBulkPanel {...base} />);
    expectNoChineseText(eligible);
    expect(eligible).toContain("2 selected (maximum 1,000)");
    expect(eligible).toContain("staff@example.org");

    const ineligible = renderAdminInEnglish(
      <AdoptionAssignmentBulkPanel {...base} statusEligible={false} selectedIds={[]} />,
    );
    expectNoChineseText(ineligible);
    expect(ineligible).toContain("Choose an open pending stage first.");

    queries = { "admin-access-users": { isError: true, data: undefined } };
    const failed = renderAdminInEnglish(<AdoptionAssignmentBulkPanel {...base} />);
    expectNoChineseText(failed);
    expect(failed).toContain("Could not load the staff list. Try again.");
  });

  test("keeps the Chinese panel as it was", () => {
    queries = { "admin-access-users": { data: { users: [] } } };
    const markup = renderAdminInChinese(<AdoptionAssignmentBulkPanel {...base} />);
    for (const text of [
      "領養個案批量分派",
      "選擇已啟用的職員",
      "最少等待日數",
      "已選 2 筆（上限 1000）",
      "建立分派預覽",
    ]) {
      expect(markup, text).toContain(text);
    }
  });
});

describe("case detail in English", () => {
  const load = (override: Record<string, unknown> = {}) => {
    queries = {
      "adoption-case": { data: { case: { ...caseDetail, ...override } } },
      "coordinator-statuses": { data: { statuses } },
      "admin-active-animal-options": { data: [] },
    };
  };

  test("shows every section without Chinese except the applicant's own details", () => {
    load();
    const markup = renderAdminInEnglish(<CaseDetail caseId="c-1" />);
    expectNoChineseText(markup, { allow: CASE_FIXTURE_TEXT });
    for (const text of [
      "Back to cases",
      "Refresh",
      ">Applicant<",
      ">Public submission<",
      "Ranked animal preferences",
      "Visit preferences",
      ">Questionnaire<",
      "Application photos",
      "Status link",
      "Assessment and preferences",
      "Status controls",
      ">Matches<",
      "Finalisation",
      "Review summary",
      "1 Oct 2026 (Thu)",
      "2 Oct 2026 (Fri)",
      "HK$500.50",
      "HK-2026-001",
      "Successful adoption recorded",
      "Yes",
      "Home",
      "WhatsApp",
      "10 Oct 2026 (Sat) - 20 Oct 2026 (Tue)",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("Not finalised");
  });

  test("shows an unfinished case in English", () => {
    load({
      successfulAdoption: null,
      publicAdoption: null,
      matches: [],
      followups: [],
      closedAt: null,
    });
    const markup = renderAdminInEnglish(<CaseDetail caseId="c-1" />);
    expectNoChineseText(markup, { allow: CASE_FIXTURE_TEXT });
    expect(markup).toContain("Not finalised");
    expect(markup).toContain("No matches yet");
  });

  test("shows the status link states and the empty public details in English", () => {
    load({
      publicAdoption: {
        ...publicAdoption,
        animalPreferences: [],
        visitPreference: null,
        photos: [],
        statusToken: {
          expiresAt: "2026-11-01T00:00:00Z",
          revokedAt: "2026-10-05T00:00:00Z",
          lastViewedAt: null,
        },
      },
    });
    const empty = renderAdminInEnglish(<CaseDetail caseId="c-1" />);
    expectNoChineseText(empty, { allow: CASE_FIXTURE_TEXT });
    for (const text of [
      "No public application detail captured",
      "No visit preference captured",
      "No photos uploaded",
      "Revoked",
    ]) {
      expect(empty, text).toContain(text);
    }
    load({ publicAdoption: { ...publicAdoption, statusToken: null } });
    const none = renderAdminInEnglish(<CaseDetail caseId="c-1" />);
    expectNoChineseText(none, { allow: CASE_FIXTURE_TEXT });
    expect(none).toContain("No status link recorded");
  });

  test("shows a status in English, and its Chinese label when label_en is empty", () => {
    load({ status: status({ labelEn: "", labelZh: "待跟進" }) });
    const markup = renderAdminInEnglish(<CaseDetail caseId="c-1" />);
    expect(markup).toContain("待跟進");
    load({ status: status({ labelEn: "Pending", labelZh: "待跟進" }) });
    const english = renderAdminInEnglish(<CaseDetail caseId="c-1" />);
    expect(english).not.toContain("待跟進");
  });

  test("shows the loading, failure and missing states in English", () => {
    queries = {
      "adoption-case": { isLoading: true, data: undefined },
      "coordinator-statuses": { data: { statuses } },
    };
    expectNoChineseText(renderAdminInEnglish(<CaseDetail caseId="c-1" />));
    queries["adoption-case"] = { data: undefined, error: new Error("boom") };
    const failed = renderAdminInEnglish(<CaseDetail caseId="c-1" />);
    expectNoChineseText(failed);
    expect(failed).toContain("Back to cases");
    expect(failed).toContain("Could not load");
    queries["adoption-case"] = { data: { case: null } };
    const missing = renderAdminInEnglish(<CaseDetail caseId="c-1" />);
    expectNoChineseText(missing);
    expect(missing).toContain("Case not found. Go back to the cases list and choose another case.");
  });

  test("keeps the Chinese case detail, dates and fee as they were", () => {
    load();
    const markup = renderAdminInChinese(<CaseDetail caseId="c-1" />);
    expect(markup).toContain("2026-10-10 - 2026-10-20");
    for (const text of [
      "返回個案",
      "審核摘要",
      "公開申請",
      "動物偏好排序",
      "完成領養",
      "已記錄成功領養",
      "2026-10-01",
      "HK$500.50",
      "家居",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("the case detail copy has no Chinese in English, and the zh messages are unchanged", () => {
    expectNoChineseInCopy(caseDetailCopy.en);
    expect(caseDetailCopy.zh.statusesError("x")).toBe("無法載入狀態: x");
    expect(caseDetailCopy.zh.photoOpenFailed("x")).toBe("無法開啟相片: x");
    expect(caseDetailCopy.en.statusesError("x")).toBe(
      "Could not load statuses (x). Refresh the page to try again.",
    );
    expect(caseDetailCopy.en.notFinalized).toBe("Not finalised");
    // 家庭人數 is "household size", as the glossary has it.
    expect(caseDetailCopy.en.labels.familySize).toBe("Household size");
    expect(caseDetailCopy.zh.labels.familySize).toBe("家庭人數");
  });
});

describe("adopter detail in English", () => {
  const adopter = {
    id: "ad-1",
    supporterId: "sup-1",
    displayName: "陳大文",
    email: "chan@example.org",
    phone: "91234567",
    livingArea: "九龍",
    isBlacklisted: true,
    openCaseCount: 1,
    successfulAdoptionCount: 1234,
    openTaskCount: 2,
    latestCaseAt: "2026-10-01T02:30:00Z",
    latestCase: caseSummary,
    nameEnglish: "Chan Tai Man",
    nameChinese: "陳大文",
    gender: "男",
    birthday: "1990-01-01",
    occupation: "教師",
    facebook: null,
    householdSize: "3",
    monthlyHouseholdIncome: "30000",
    address: "九龍某處",
    floorArea: "500",
    blacklistReason: "失聯",
    emailConsent: "opt_in",
    whatsappConsent: "opt_out",
    cases: [caseSummary],
    successfulAdoptions: [
      {
        id: "sa-1",
        caseNumber: "HK-2026-001",
        animalId: "a-1",
        animalName: "小白",
        adoptionFeeCents: 50000,
        approvalDate: "2026-10-03",
        pickupDate: null,
      },
    ],
    tasks: [task],
  };
  const allowed = [
    "陳大文",
    "九龍",
    "九龍某處",
    "男",
    "教師",
    "失聯",
    "小白",
    "致電申請人",
    "阿明",
    "跟進備註",
  ];

  test("shows the profile, the history and the counts in English", () => {
    queries = {
      "adopter-profile": { data: { adopter } },
      "coordinator-statuses": { data: { statuses } },
    };
    const markup = renderAdminInEnglish(<AdopterDetail adopterId="ad-1" />);
    expectNoChineseText(markup, { allow: allowed });
    for (const text of [
      "Back to adopters",
      "Blacklisted",
      "Profile summary",
      "Opted in",
      "Opted out",
      "1,234",
      "Case history",
      "1 linked case<",
      "1 finalised adoption<",
      "HK$500.00",
      "3 Oct 2026 (Sat)",
      "1 Jan 1990 (Mon)",
      "Adopter follow-ups",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("shows the empty history and the follow-up statuses failure in English", () => {
    queries = {
      "adopter-profile": {
        data: {
          adopter: {
            ...adopter,
            isBlacklisted: false,
            cases: [],
            successfulAdoptions: [],
            emailConsent: null,
            whatsappConsent: null,
            latestCase: null,
            latestCaseAt: null,
          },
        },
      },
      "coordinator-statuses": { data: { statuses }, error: new Error("nope") },
    };
    const markup = renderAdminInEnglish(<AdopterDetail adopterId="ad-1" />);
    expectNoChineseText(markup, { allow: allowed });
    for (const text of [
      "No case history",
      "No successful adoptions recorded",
      "0 linked cases",
      "Could not load follow-up statuses (nope). Refresh the page to try again.",
      "Creating or editing a task may need these statuses, so check the status settings.",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("writes a lapsed session in the follow-up statuses failure in English", () => {
    queries = {
      "adopter-profile": { data: { adopter } },
      "coordinator-statuses": {
        data: { statuses },
        error: new AdminSessionError("not_signed_in"),
      },
    };
    const markup = renderAdminInEnglish(<AdopterDetail adopterId="ad-1" />);
    expectNoChineseText(markup, { allow: allowed });
    expect(markup).toContain(
      "Could not load follow-up statuses (Not signed in. Sign in again.). Refresh the page to try again.",
    );
    expect(renderAdminInChinese(<AdopterDetail adopterId="ad-1" />)).toContain(
      "無法載入跟進狀態: 未登入",
    );
  });

  test("shows the loading, failure and missing states in English", () => {
    queries = { "adopter-profile": { isLoading: true, data: undefined } };
    expectNoChineseText(renderAdminInEnglish(<AdopterDetail adopterId="ad-1" />));
    queries = { "adopter-profile": { data: undefined, error: new Error("boom") } };
    const failed = renderAdminInEnglish(<AdopterDetail adopterId="ad-1" />);
    expectNoChineseText(failed);
    expect(failed).toContain("Back to adopters");
    queries = { "adopter-profile": { data: { adopter: null } } };
    const missing = renderAdminInEnglish(<AdopterDetail adopterId="ad-1" />);
    expectNoChineseText(missing);
    expect(missing).toContain("Adopter profile not found.");
  });

  test("keeps the Chinese adopter detail as it was", () => {
    queries = {
      "adopter-profile": { data: { adopter } },
      "coordinator-statuses": { data: { statuses } },
    };
    const markup = renderAdminInChinese(<AdopterDetail adopterId="ad-1" />);
    for (const text of [
      "返回領養人",
      "黑名單",
      "檔案摘要",
      "已同意",
      "已拒絕",
      "1 個相關個案",
      "1 個已完成領養",
      "HK$500",
      "2026-10-03",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(adopterDetailCopy.zh.loadFollowupStatusesError("x")).toBe("無法載入跟進狀態: x");
  });

  test("the adopter detail copy has no Chinese in English", () => {
    expectNoChineseInCopy(adopterDetailCopy.en);
    expect(adopterDetailCopy.en.linkedCases(3)).toBe("3 linked cases");
    expect(adopterDetailCopy.en.finalizedAdoptions(1)).toBe("1 finalised adoption");
  });
});

describe("match panel in English", () => {
  const matches = caseDetail.matches;

  test("shows the matches and the form in English", () => {
    queries = { "admin-active-animal-options": { data: [] } };
    const markup = renderAdminInEnglish(
      <MatchPanel caseId="c-1" matches={matches as never} statuses={statuses as never} />,
    );
    expectNoChineseText(markup, { allow: ["小白", "阿黑", "配對備註"] });
    for (const text of [
      ">Matches<",
      "2 matches recorded",
      ">Animal<",
      "Match status",
      ">Notes<",
      "Add match",
      ">Approved<",
      ">No<",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("shows the loading, empty and failed states in English", () => {
    queries = { "admin-active-animal-options": { isLoading: true, data: undefined } };
    const loading = renderAdminInEnglish(
      <MatchPanel caseId="c-1" matches={[]} statuses={statuses as never} />,
    );
    expectNoChineseText(loading);
    expect(loading).toContain("Loading animals...");
    expect(loading).toContain("No matches yet");
    expect(loading).toContain("0 matches recorded");

    queries = {
      "admin-active-animal-options": { data: undefined, error: new Error("Animal load failed") },
    };
    const failed = renderAdminInEnglish(
      <MatchPanel caseId="c-1" matches={[]} statuses={statuses as never} />,
    );
    expect(failed).toContain("Animal load failed");
  });

  test("shows a match status in English, and its Chinese label when label_en is empty", () => {
    queries = { "admin-active-animal-options": { data: [] } };
    const withEnglish = renderAdminInEnglish(
      <MatchPanel caseId="c-1" matches={matches as never} statuses={statuses as never} />,
    );
    expect(withEnglish).toContain("Approved");
    expect(withEnglish).not.toContain("已批核");
    const noEnglish = [{ ...matches[0], status: { ...approvedStatus, labelEn: "" } }];
    const fallback = renderAdminInEnglish(
      <MatchPanel caseId="c-1" matches={noEnglish as never} statuses={statuses as never} />,
    );
    expect(fallback).toContain("已批核");
  });

  test("lists an animal by its English name, or its Chinese name when name_en is null", () => {
    const { matchPanelCopy } = copyModule;
    expect(matchPanelCopy.en.animalOption("小白", "Snowy", "Cat", "Available")).toBe(
      "Snowy (Cat · Available)",
    );
    expect(matchPanelCopy.en.animalOption("阿黑", null, "Dog", "Fostered")).toBe(
      "阿黑 (Dog · Fostered)",
    );
    expect(matchPanelCopy.en.animalOption("阿黑", "", "Dog", "Fostered")).toBe(
      "阿黑 (Dog · Fostered)",
    );
    // Chinese lists both names, as before.
    expect(matchPanelCopy.zh.animalOption("小白", "Snowy", "貓", "可領養")).toBe(
      "小白 / Snowy (貓 · 可領養)",
    );
    expect(matchPanelCopy.zh.animalOption("阿黑", null, "狗", "暫託中")).toBe("阿黑 (狗 · 暫託中)");
  });

  test("keeps the Chinese match panel as it was", () => {
    queries = { "admin-active-animal-options": { data: [] } };
    const markup = renderAdminInChinese(
      <MatchPanel caseId="c-1" matches={matches as never} statuses={statuses as never} />,
    );
    for (const text of ["配對", "2 筆紀錄", "新增配對", "選填協調員備註", "已批核", "配對狀態"]) {
      expect(markup, text).toContain(text);
    }
  });

  test("the match panel copy has no Chinese in English", () => {
    expectNoChineseInCopy(copyModule.matchPanelCopy.en);
    expect(copyModule.matchPanelCopy.en.recorded(1)).toBe("1 match recorded");
  });
});

describe("finalisation panel in English", () => {
  const matches = caseDetail.matches;

  test("shows the form in English", () => {
    const markup = renderAdminInEnglish(
      <FinalizationPanel
        caseId="c-1"
        matches={matches as never}
        statuses={statuses as never}
        successfulAdoption={null}
      />,
    );
    expectNoChineseText(markup);
    for (const text of [
      ">Finalisation<",
      "Requires an approved match and an adopted final outcome.",
      "Approved match",
      "Final outcome",
      "Case number",
      "Approval date",
      "Pickup date",
      "Adoption fee (HK$)",
      "Finalise adoption",
      "Fill in the required fields. Enter the fee in dollars and cents.",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("Finalize");
  });

  test("tells what is missing before an adoption can be finalised", () => {
    const noMatch = renderAdminInEnglish(
      <FinalizationPanel caseId="c-1" matches={[]} statuses={[]} successfulAdoption={null} />,
    );
    expectNoChineseText(noMatch);
    expect(noMatch).toContain("Create a match with an approved match status before finalising.");
    const noOutcome = renderAdminInEnglish(
      <FinalizationPanel
        caseId="c-1"
        matches={matches as never}
        statuses={[status()] as never}
        successfulAdoption={null}
      />,
    );
    expect(noOutcome).toContain(
      "Create an active final outcome status with the key adopted before finalising.",
    );
  });

  test("shows a finalised adoption with English dates and the fee with two decimals", () => {
    const done = renderAdminInEnglish(
      <FinalizationPanel
        caseId="c-1"
        matches={matches as never}
        statuses={statuses as never}
        successfulAdoption={caseDetail.successfulAdoption as never}
      />,
    );
    expectNoChineseText(done);
    for (const text of [
      "HK-2026-001",
      "3 Oct 2026 (Sat)",
      "5 Oct 2026 (Mon)",
      "HK$500.50",
      "Successful adoption recorded",
    ]) {
      expect(done, text).toContain(text);
    }
    const noFee = renderAdminInEnglish(
      <FinalizationPanel
        caseId="c-1"
        matches={[]}
        statuses={[]}
        successfulAdoption={
          { ...caseDetail.successfulAdoption, adoptionFeeCents: null, pickupDate: null } as never
        }
      />,
    );
    expect(noFee).toContain(">-<");
  });

  test("keeps the Chinese finalisation panel, dates and fee as they were", () => {
    const form = renderAdminInChinese(
      <FinalizationPanel
        caseId="c-1"
        matches={matches as never}
        statuses={statuses as never}
        successfulAdoption={null}
      />,
    );
    for (const text of [
      "完成領養",
      "需要已批核配對及已領養的最終結果。",
      "領養費 HKD",
      "請填寫必填欄位。費用可輸入元及角分。",
    ]) {
      expect(form, text).toContain(text);
    }
    const done = renderAdminInChinese(
      <FinalizationPanel
        caseId="c-1"
        matches={matches as never}
        statuses={statuses as never}
        successfulAdoption={caseDetail.successfulAdoption as never}
      />,
    );
    for (const text of ["已記錄成功領養", "2026-10-03", "2026-10-05", "HK$500.50"]) {
      expect(done, text).toContain(text);
    }
  });

  test("the finalisation copy has no Chinese in English, and the zh key and value text is unchanged", () => {
    expectNoChineseInCopy(copyModule.finalizationCopy.en);
    expect(copyModule.finalizationCopy.zh.missingAdoptedOutcome).toBe(
      "完成前請建立一個 key 為 adopted 的啟用中最終結果狀態。",
    );
  });
});

describe("status labels in selects", () => {
  // Radix select items are not rendered in a static render, so the option label is tested directly.
  test("Chinese lists both labels, as before, and English lists only the English label", () => {
    const pending = status({ labelZh: "待處理", labelEn: "Pending" });
    expect(bilingualStatusName(pending, "zh")).toBe("待處理 / Pending");
    expect(bilingualStatusName(pending, "en")).toBe("Pending");
  });

  test("English falls back to the Chinese label when label_en is empty or missing", () => {
    const noEnglish = status({ labelZh: "跟進中", labelEn: "" });
    expect(bilingualStatusName(noEnglish, "en")).toBe("跟進中");
    expect(bilingualStatusName(noEnglish, "zh")).toBe("跟進中");
    expect(bilingualStatusName({ labelZh: "跟進中" }, "en")).toBe("跟進中");
  });

  test("no fixture status shows Chinese beside its English label in English", () => {
    for (const item of statuses) {
      const label = bilingualStatusName(item, "en");
      expect(label).toBe(item.labelEn);
      expect(label).not.toContain(" / ");
    }
  });
});

describe("date and fee formats", () => {
  test("English uses the Hong Kong date and the fee with two decimals", () => {
    const format = adoptionFormatCopy.en;
    expect(format.date("2026-10-07")).toBe("7 Oct 2026 (Wed)");
    expect(format.date("2026-10-06T20:00:00Z")).toBe("7 Oct 2026 (Wed)");
    expect(format.date(null)).toBe("-");
    expect(format.date("  ")).toBe("-");
    expect(format.money(123400)).toBe("HK$1,234.00");
    expect(format.money(null)).toBe("-");
  });

  test("Chinese keeps the plain date and the fee without trailing zeros", () => {
    const format = adoptionFormatCopy.zh;
    expect(format.date("2026-10-06T20:00:00Z")).toBe("2026-10-06");
    expect(format.date(undefined)).toBe("-");
    expect(format.money(123400)).toBe("HK$1,234");
    expect(format.money(123450)).toBe("HK$1,234.50");
    expect(format.money(undefined)).toBe("-");
  });
});

describe("animal pipeline in English", () => {
  const profile = {
    animal_id: "a-1",
    internal_code: "CAT-001",
    arrival_date: "2026-09-01",
    arrival_source_id: "src-1",
    current_position_id: "pos-1",
    cage: "A-12",
    has_chip: true,
    chip_remarks: "Chip remark",
    is_desexed: false,
    desexed_at: null,
    desex_remarks: null,
    is_adoptable: true,
    is_inside_support_pool: true,
    adopted_at: null,
    deceased_at: null,
    internal_remarks: null,
  };
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "a-1",
    type: "cat",
    name: "小白",
    name_en: "Snowy",
    gender: "female",
    age: "6歲",
    status: "available",
    image_url: null,
    created_at: null,
    updated_at: null,
    profile,
    currentPosition: { id: "pos-1", name: "Yuen Long foster home", type: "foster" },
    arrivalSource: { id: "src-1", name_zh: "街頭救援", name_en: "Street rescue" },
    ...overrides,
  });
  const rows = [
    row(),
    row({
      id: "a-2",
      name: "阿黑",
      name_en: null,
      type: "dog",
      status: "fostered",
      profile: {
        ...profile,
        animal_id: "a-2",
        has_chip: null,
        is_desexed: true,
        is_adoptable: false,
        is_inside_support_pool: false,
      },
      currentPosition: null,
      arrivalSource: { id: "src-2", name_zh: "市民轉讓", name_en: "" },
    }),
  ];
  const allowed = ["小白", "阿黑", "6歲", "市民轉讓"];
  const loadPipeline = () => {
    queries = {
      "coordinator-animal-pipeline": { data: { animals: rows, total: 41, page: 2, pageSize: 10 } },
      "animal-positions": { data: [] },
      "arrival-sources": { data: [] },
      "coordinator-statuses": { data: statuses },
    };
  };

  test("shows the list, the filters and the paging in English", () => {
    loadPipeline();
    const markup = renderAdminInEnglish(<AnimalPipeline />);
    expectNoChineseText(markup, { allow: allowed });
    for (const text of [
      ">Animal pipeline<",
      "Internal lifecycle, placement, support pool and medical readiness.",
      'aria-label="Search animal pipeline"',
      'placeholder="Search name, code, cage or position"',
      'aria-label="Filter by lifecycle status"',
      "2 shown",
      "41 matching in total",
      "1 adoptable on this page",
      "1 in the support pool on this page",
      ">Lifecycle<",
      ">Flags<",
      ">Arrival<",
      "Snowy",
      "Cat / 6歲",
      "Dog / 6歲",
      "Microchip: yes",
      "Neutered: no",
      "Microchip: unknown",
      "Cage A-12",
      "1 Sep 2026 (Tue)",
      "Street rescue",
      "1 animal<",
      "Page 2 of 5",
      ">Previous<",
      ">Next<",
      'aria-label="Rows per page"',
    ]) {
      expect(markup, text).toContain(text);
    }
    // The English name is the main name; the Chinese one stays where there is no English one.
    expect(markup).not.toContain("小白");
    expect(markup).toContain("阿黑");
    // An arrival source with an empty name_en shows its Chinese name.
    expect(markup).toContain("市民轉讓");
    expect(markup).not.toContain("Desex");
  });

  test("shows the empty, loading and failed states in English", () => {
    loadPipeline();
    queries["coordinator-animal-pipeline"] = {
      data: { animals: [], total: 0, page: 1, pageSize: 25 },
    };
    queries["animal-positions"] = {
      data: undefined,
      error: new Error("Positions could not load: x"),
    };
    const empty = renderAdminInEnglish(<AnimalPipeline />);
    expectNoChineseText(empty);
    expect(empty).toContain("No animals match these filters.");
    expect(empty).toContain("Positions could not load: x");

    queries["coordinator-animal-pipeline"] = { isLoading: true, data: undefined };
    expectNoChineseText(renderAdminInEnglish(<AnimalPipeline />));

    queries["coordinator-animal-pipeline"] = { data: undefined, error: new Error("pipeline down") };
    expect(renderAdminInEnglish(<AnimalPipeline />)).toContain("pipeline down");
  });

  test("keeps the Chinese admin showing what it always showed", () => {
    loadPipeline();
    const markup = renderAdminInChinese(<AnimalPipeline />);
    // The pipeline was built in English: only the paging and the empty state were Chinese.
    for (const text of [
      ">Animal pipeline<",
      "Internal lifecycle, placement, support pool, and medical readiness.",
      "Chip Y",
      "Snowy / cat / 6歲",
      "Desex N",
      "第 2 頁，共 5 頁",
      "上一頁",
      "下一頁",
      "1 animals",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toContain("小白");
    queries["coordinator-animal-pipeline"] = {
      data: { animals: [], total: 0, page: 1, pageSize: 25 },
    };
    expect(renderAdminInChinese(<AnimalPipeline />)).toContain("沒有符合篩選條件的動物。");
  });

  test("shows the internal profile dialog in English", () => {
    const props = {
      open: true,
      animalName: "Snowy",
      profileForm: profile,
      sourceOptions: [
        { id: "src-1", name_zh: "街頭救援", name_en: "Street rescue" },
        { id: "src-2", name_zh: "市民轉讓", name_en: null },
      ],
      positionOptions: [{ id: "pos-1", name: "Yuen Long foster home", type: "foster" }],
      saving: false,
      saveError: null,
      onFieldChange: () => {},
      onSubmit: () => {},
      onRequestClose: () => {},
      animalId: "a-1",
      tasks: [task],
      statuses: statuses as never,
      tasksError: "Tasks unavailable",
      onRetryTasks: () => {},
      onTasksChanged: async () => {},
    };
    const markup = renderAdminInEnglish(<AnimalProfileDialog {...props} />);
    expectNoChineseText(markup, { allow: ["致電申請人", "阿明", "跟進備註"] });
    for (const text of [
      "Internal profile: Snowy",
      "Placement, intake, medical and coordinator-only notes.",
      "Internal code",
      "Arrival date",
      "Arrival source",
      "Current position",
      ">Cage<",
      "Microchip",
      "Microchip remarks",
      "Neutered",
      "Neutered date",
      "Neutering remarks",
      "Controls the internal readiness filters.",
      "Marks animals that need internal support.",
      "Adopted date",
      "Deceased date",
      "Internal remarks",
      ">Cancel<",
      "Save profile",
      "Animal tasks",
      "Open coordinator work for this animal",
      "Tasks unavailable",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("Desex");

    const saving = renderAdminInEnglish(
      <AnimalProfileDialog {...props} saving saveError="Save failed" />,
    );
    expect(saving).toContain("Saving...");
    expect(saving).toContain("Save failed");

    const bare = renderAdminInEnglish(
      <AnimalProfileDialog
        {...props}
        profileForm={{ ...profile, arrival_source_id: null, current_position_id: null }}
        sourceOptions={[]}
        positionOptions={[]}
        tasksError={null}
        onRetryTasks={() => {}}
      />,
    );
    expectNoChineseText(bare, { allow: ["致電申請人", "阿明", "跟進備註"] });
    expect(bare).toContain("No arrival sources are configured.");
    expect(bare).toContain("No animal positions are configured.");
  });

  test("keeps the Chinese admin's profile dialog as the English screen it always was", () => {
    const markup = renderAdminInChinese(
      <AnimalProfileDialog
        open
        animalName="小白"
        profileForm={profile}
        sourceOptions={[]}
        positionOptions={[]}
        saving={false}
        saveError={null}
        onFieldChange={() => {}}
        onSubmit={() => {}}
        onRequestClose={() => {}}
        animalId="a-1"
        tasks={[]}
        statuses={[]}
        tasksError={null}
        onRetryTasks={() => {}}
        onTasksChanged={async () => {}}
      />,
    );
    for (const text of [
      "Internal profile: 小白",
      "Desexed date",
      "Desex remarks",
      "Save profile",
      "No arrival sources are configured.",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("the pipeline copy has no Chinese in English, and the Chinese prompts are unchanged", () => {
    expectNoChineseInCopy(animalPipelineCopy.en);
    expect(animalPipelineCopy.zh.discardConfirm).toBe("尚未儲存的變更將會遺失，確定關閉？");
    expect(animalPipelineCopy.zh.page(2, 5)).toBe("第 2 頁，共 5 頁");
    expect(animalPipelineCopy.en.page(2, 5)).toBe("Page 2 of 5");
    expect(animalPipelineCopy.en.animalCount(1)).toBe("1 animal");
    expect(animalPipelineCopy.en.animalCount(3)).toBe("3 animals");
    expect(animalPipelineCopy.en.sourceOption("街頭救援", "Street rescue")).toBe("Street rescue");
    expect(animalPipelineCopy.en.sourceOption("市民轉讓", null)).toBe("市民轉讓");
    expect(animalPipelineCopy.zh.sourceOption("街頭救援", "Street rescue")).toBe(
      "街頭救援 / Street rescue",
    );
  });
});

// A query refetched after the session lapsed fails with a session error, whose message is the
// Chinese text by design. Each screen writes it in its own language.
describe("a lapsed session in the adoption screens", () => {
  const notSignedIn = () => new AdminSessionError("not_signed_in");
  const english = "Not signed in. Sign in again.";

  test("the case list writes a failed status filter in English, and in Chinese as before", () => {
    queries = {
      "admin-me": { data: { admin: { role: "staff" } } },
      "coordinator-statuses": { data: undefined, error: notSignedIn() },
      "adoption-cases": { data: { cases: [], total: 0 } },
    };
    const markup = renderAdminInEnglish(<CaseList />);
    expectNoChineseText(markup);
    expect(markup).toContain(`Could not load status filters: ${english}`);
    expect(renderAdminInChinese(<CaseList />)).toContain("無法載入狀態篩選: 未登入");
  });

  test("the case detail writes its failed statuses in English, and in Chinese as before", () => {
    queries = {
      "adoption-case": {
        data: { case: { ...caseDetail, publicAdoption: null, matches: [], followups: [] } },
      },
      "coordinator-statuses": { data: undefined, error: notSignedIn() },
      "admin-active-animal-options": { data: [] },
    };
    const markup = renderAdminInEnglish(<CaseDetail caseId="c-1" />);
    expectNoChineseText(markup, { allow: CASE_FIXTURE_TEXT });
    expect(markup).toContain(
      `Could not load statuses (${english}). Refresh the page to try again.`,
    );
    expect(renderAdminInChinese(<CaseDetail caseId="c-1" />)).toContain("無法載入狀態: 未登入");
  });

  test("the match panel writes a failed animal list in English, and in Chinese as before", () => {
    queries = { "admin-active-animal-options": { data: undefined, error: notSignedIn() } };
    const match = <MatchPanel caseId="c-1" matches={[]} statuses={statuses as never} />;
    const markup = renderAdminInEnglish(match);
    expectNoChineseText(markup);
    // The failed list is a failure state with a retry, titled with the message it always showed.
    expect(markup).toContain(`>${english}</p>`);
    expect(markup).toMatch(/<button[^>]*>Retry<\/button>/);
    expect(renderAdminInChinese(match)).toContain(">未登入</p>");
  });

  test("the animal pipeline names the failed lookup and writes its cause in English", () => {
    queries = {
      "coordinator-animal-pipeline": { data: undefined, error: notSignedIn() },
      "animal-positions": {
        data: undefined,
        error: new PipelineLookupError("positions", notSignedIn()),
      },
      "arrival-sources": { data: [] },
      "coordinator-statuses": { data: undefined, error: notSignedIn() },
    };
    const markup = renderAdminInEnglish(<AnimalPipeline />);
    expectNoChineseText(markup);
    expect(markup).toContain(`Positions could not load: ${english}`);
    expect(markup).toContain(`>${english}</p>`);
    // The pipeline and the two failed lookups (positions, statuses) are each a failure state with
    // a retry.
    expect(markup.match(/<button[^>]*>Retry<\/button>/g)).toHaveLength(3);
    const chinese = renderAdminInChinese(<AnimalPipeline />);
    expect(chinese).toContain("Positions could not load: 未登入");
    expect(chinese).toContain(">未登入</p>");
  });
});

describe("intake urgency", () => {
  test("takes its labels from the application inbox page copy in both languages", () => {
    expect(intakeUrgencyLabel("normal", "zh")).toBe("普通");
    expect(intakeUrgencyLabel("high", "en")).toBe("High");
    expect(intakeUrgencyLabel("overdue", "en")).toBe("Overdue");
    expect(intakeUrgencyLabel("overdue", "zh")).toBe("逾期");
  });
});
