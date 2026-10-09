import { describe, expect, mock, test } from "bun:test";

import type { IntakeBody, InternshipApplication } from "../../site/InternshipForm";
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
 * The screen reads its data through React Query. This stand-in answers by the query key, so a
 * static render shows a loaded screen; the toggles below show the other states.
 */
let role: "admin" | "staff" = "admin";
let settingsLoaded = true;
let listLoading = false;
let listFailed = false;
let detailFailed = false;
let applicationStatus = "submitted";

// Names and answers an applicant or staff member typed are data: shown as stored in both languages.
const APPLICANT = "陳小明";
const INSTITUTION = "香港大學";
const COURSE = "獸醫學士";
const STATEMENT = "我想學習照顧動物。";
const NOTE = "請補交學生證";
const DATA = [APPLICANT, INSTITUTION, COURSE, STATEMENT, NOTE];

const intake: IntakeBody = {
  enabled: true,
  name: "Vet student internship",
  shelters: ["cat", "dog"],
  opens_at: "2026-10-01T00:00:00+08:00",
  closes_at: "2026-12-31T23:59:00+08:00",
  instructions: "Bring your student card",
};

function application(): InternshipApplication {
  return {
    id: "app-1",
    revision: 3,
    status: applicationStatus,
    shelter: "cat",
    contact_snapshot: { name: APPLICANT, email: "chan@example.org", phone: "9123 4567" },
    student_snapshot: { institution: INSTITUTION, course: COURSE, statement: STATEMENT },
    events: [
      { id: "e1", kind: "review", detail: { reason: NOTE, evidence: "Email" } },
      { id: "e2", kind: "submit", detail: {} },
    ],
    attachments: [{ id: "f1", label: "student-card.pdf" }],
  };
}

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    const key = String(options.queryKey[0]);
    const base = { isLoading: false, isFetching: false, error: null, refetch() {} };
    if (key === "admin-me") return { ...base, data: { admin: { role } } };
    if (key === "internship-settings")
      return {
        ...base,
        data: settingsLoaded
          ? {
              draft: { body: intake, revision: 2 },
              current: { body: { ...intake, enabled: false } },
              history: [
                { id: "h1", body: intake, reason: "Opened for autumn" },
                { id: "h2", body: { ...intake, name: "Older title" }, reason: "First version" },
              ],
            }
          : undefined,
      };
    if (key === "internships" && options.queryKey[1] === "list")
      return listFailed
        ? { ...base, data: undefined, error: new Error("boom") }
        : {
            ...base,
            isLoading: listLoading,
            data: listLoading
              ? undefined
              : {
                  total: 60,
                  applications: [
                    {
                      id: "app-1",
                      name: APPLICANT,
                      institution: INSTITUTION,
                      status: "submitted",
                    },
                    { id: "app-2", name: "Wong Ka Yan", institution: "Other", status: "approved" },
                    { id: "app-3", name: "Lau Ho", institution: "Third", status: "withdrawn" },
                  ],
                },
          };
    if (key === "internships" && options.queryKey[1] === "detail")
      return detailFailed
        ? { ...base, data: undefined, error: new Error("boom") }
        : { ...base, data: { application: application() } };
    return { ...base, data: undefined };
  },
}));

const { InternshipManagement, IntakePublishPreview } = await import("./InternshipManagement");
const { internshipCopy, INTERNSHIP_STATUS_KEYS } = await import("./copy");
const { internshipStatuses } = await import("../../site/InternshipForm");

function expectAll(markup: string, texts: string[]) {
  for (const text of texts) expect(markup, text).toContain(text);
}

describe("internship management in English", () => {
  test("shows the applications and the review form in English", () => {
    role = "admin";
    settingsLoaded = true;
    listLoading = false;
    listFailed = false;
    detailFailed = false;
    applicationStatus = "submitted";
    const markup = renderAdminInEnglish(<InternshipManagement />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Veterinary student internship applications",
      "These applications are separate from volunteer tiers and session places",
      "Search applicants",
      "Application status",
      ">All<",
      ">Pending review<",
      ">Needs information<",
      ">Approved<",
      ">Not approved<",
      ">Withdrawn<",
      'aria-label="Applicant"',
      "Choose an application",
      `${APPLICANT} · ${INSTITUTION} · Pending review`,
      "Wong Ka Yan · Other · Approved",
      "Lau Ho · Third · Withdrawn",
      "Internship applications pagination",
      `${APPLICANT} · Pending review`,
      "chan@example.org · 9123 4567",
      `${INSTITUTION} · ${COURSE} · Cat shelter`,
      "student-card.pdf",
      "Review and supplement records",
      NOTE,
      " · Email",
      "Details recorded",
      "Outcome",
      "Ask for more information",
      "Do not approve",
      "Review reason",
      "Veterinary student identity and institution or course verified",
      "Source of verification evidence",
      "Save review decision",
    ]);
  });

  test("shows the administrators' intake settings in English", () => {
    role = "admin";
    const markup = renderAdminInEnglish(<InternshipManagement />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Intake settings and versions (administrators)",
      "Currently: new applications paused. Save a draft first, then preview the changes before publishing.",
      "Title",
      "Vet student internship",
      "Accept new applications",
      "Shelters",
      "Cat shelter",
      "Dog shelter",
      "Opens at (Hong Kong time; leave blank for no limit)",
      "Closes at (Hong Kong time; leave blank for no limit)",
      'value="2026-10-01T00:00"',
      "Application instructions",
      "Bring your student card",
      "Save draft",
      "Preview changes",
      "Version history",
      "Opened for autumn",
      "Older title",
      "Duplicate as new draft",
    ]);
  });

  test("shows settings that have not loaded, a loading list and a failed list in English", () => {
    role = "admin";
    settingsLoaded = false;
    listLoading = true;
    const loading = renderAdminInEnglish(<InternshipManagement />);
    expectNoChineseText(loading, { allow: DATA });
    expectAll(loading, ["Loading internship intake settings…", "Loading…"]);
    settingsLoaded = true;
    listLoading = false;
    listFailed = true;
    const failed = renderAdminInEnglish(<InternshipManagement />);
    listFailed = false;
    expectNoChineseText(failed, { allow: DATA });
    expect(failed).toContain(
      "Could not load the internship applications. Refresh the page and try again.",
    );
  });

  test("shows a failed application detail with a retry in English", () => {
    role = "staff";
    detailFailed = true;
    const markup = renderAdminInEnglish(<InternshipManagement />);
    detailFailed = false;
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Could not load the application details. Select Retry or refresh the page.",
      ">Retry<",
    ]);
  });

  test("shows staff no intake settings, and an approved application no review form", () => {
    role = "staff";
    applicationStatus = "approved";
    const markup = renderAdminInEnglish(<InternshipManagement />);
    applicationStatus = "submitted";
    expectNoChineseText(markup, { allow: DATA });
    expect(markup).not.toContain("Intake settings and versions");
    expect(markup).not.toContain("Save review decision");
    expect(markup).toContain(`${APPLICANT} · Approved`);
  });

  test("shows the before-and-after of a publish in English", () => {
    const preview = {
      preview_id: "preview-1",
      before: { ...intake, enabled: false },
      after: { ...intake, name: "New title", shelters: ["cat", "dog"] },
      existing_applications_preserved: 2,
    };
    const markup = renderAdminInEnglish(
      <IntakePublishPreview
        preview={preview}
        reason=""
        busy={false}
        onReasonChange={() => {}}
        onPublish={() => {}}
      />,
    );
    expectNoChineseText(markup);
    expectAll(markup, [
      "Before and after publishing",
      "Vet student internship → New title",
      "Paused → Open",
      "Shelters: Cat shelter, Dog shelter",
      "2 existing applications are kept. Submitted details are not rewritten.",
      "Reason for publishing",
      "Publish new version",
    ]);
    // The publish button waits for a reason.
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Publish new version/);
    const one = renderAdminInEnglish(
      <IntakePublishPreview
        preview={{ ...preview, existing_applications_preserved: 1 }}
        reason="Opened for autumn"
        busy={false}
        onReasonChange={() => {}}
        onPublish={() => {}}
      />,
    );
    expect(one).toContain("1 existing application is kept. Submitted details are not rewritten.");
    expect(one).not.toMatch(/<button[^>]*disabled[^>]*>Publish new version/);
  });

  test("keeps the Chinese screen as it was", () => {
    role = "admin";
    const markup = renderAdminInChinese(<InternshipManagement />);
    expectAll(markup, [
      "獸醫學生實習申請",
      "獨立於一般義工級別及時段名額。請按學生證明及申請資料核實身份。",
      "搜尋申請人",
      "申請狀態",
      ">全部<",
      ">待審核<",
      ">待補資料<",
      ">已批准<",
      ">未獲批准<",
      ">已撤回<",
      "選擇申請",
      `${APPLICANT} · ${INSTITUTION} · 待審核`,
      "實習申請分頁",
      `${INSTITUTION} · ${COURSE} · 貓舍`,
      "審核及補充紀錄",
      "處理結果",
      "要求補充資料",
      ">批准<",
      ">不批准<",
      "審核理由",
      "已核實獸醫學生身份及所屬院校／課程",
      "核實證據來源",
      "保存審核決定",
      "管理員收生設定與版本",
      "目前：暫停新申請。先儲存草稿，再預覽發布。",
      "開放時間（香港時間，留空不設限制）",
      "截止時間（香港時間，留空不設限制）",
      "服務場地",
      "申請指引",
      "儲存草稿",
      "預覽發布",
      "版本歷史",
      "複製為新草稿",
    ]);
    const preview = renderAdminInChinese(
      <IntakePublishPreview
        preview={{
          preview_id: "preview-1",
          before: { ...intake, enabled: false },
          after: intake,
          existing_applications_preserved: 2,
        }}
        reason=""
        busy={false}
        onReasonChange={() => {}}
        onPublish={() => {}}
      />,
    );
    expectAll(preview, [
      "發布前後",
      "暫停 → 開放",
      "場地：貓舍、狗舍",
      "保留2份既有申請，已提交資料不重寫。",
      "發布理由",
      "確認發布新版本",
    ]);
  });
});

describe("internship copy", () => {
  test("the English half has no Chinese", () => {
    const { settings, ...rest } = internshipCopy.en;
    const { sheltersLine, ...settingsRest } = settings;
    expectNoChineseInCopy(rest);
    expectNoChineseInCopy(settingsRest);
    expectNoChineseText(sheltersLine(["Cat shelter", "Dog shelter"]));
  });

  test("the five statuses are the words the public internship page uses", () => {
    // The Chinese list is written out again here, so a change to the public words shows up.
    const zhStatuses: Record<string, string> = internshipCopy.zh.statuses;
    const keys: string[] = [...INTERNSHIP_STATUS_KEYS];
    expect(zhStatuses).toEqual(internshipStatuses);
    expect(keys).toEqual(Object.keys(internshipStatuses));
  });

  test("every English error and notice says what happened or what to do next", () => {
    for (const [code, message] of Object.entries(internshipCopy.en.errors)) {
      expect(message, code).toMatch(/(again|Refresh|Ask|Change|Enter|Choose|Check|Try)/);
    }
    expect(internshipCopy.en.notices.draft_saved).toBe(
      "Draft saved. Current applications are not affected.",
    );
    expect(internshipCopy.zh.notices.draft_saved).toBe("草稿已儲存，未影響目前申請。");
    expect(internshipCopy.zh.notices.published).toBe("新版本已發布；既有申請及核實證據保留。");
  });

  test("the Chinese words that were in the component are unchanged", () => {
    expect(internshipCopy.zh.errors.settings_failed).toBe("設定未能儲存");
    expect(internshipCopy.zh.errors.review_failed).toBe("未能完成審核");
    expect(internshipCopy.zh.errors.attachment_failed).toBe("未能開啟私人附件");
    expect(internshipCopy.zh.errors.closes_before_opens).toBe("截止時間必須晚於開放時間");
    expect(internshipCopy.zh.errors.forbidden).toBe("沒有此操作權限");
    expect(internshipCopy.zh.settings.sheltersLine(["貓舍", "狗舍"])).toBe("場地：貓舍、狗舍");
    expect(internshipCopy.zh.settings.preserved(2)).toBe("保留2份既有申請，已提交資料不重寫。");
  });

  test("a count of one reads as singular", () => {
    expect(internshipCopy.en.settings.preserved(0)).toBe(
      "0 existing applications are kept. Submitted details are not rewritten.",
    );
    expect(internshipCopy.en.settings.preserved(1)).toBe(
      "1 existing application is kept. Submitted details are not rewritten.",
    );
    expect(internshipCopy.en.settings.preserved(1200)).toContain("1,200 existing applications are");
  });
});
