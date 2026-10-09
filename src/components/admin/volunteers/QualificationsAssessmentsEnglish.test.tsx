import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ZodError } from "zod";

import { AdminApiError } from "../../../lib/admin/session";
import { monthlyPolicySchema } from "../../../lib/volunteers/policy/schemas";
import { volunteerServerErrorText } from "../../../lib/volunteers/serverErrors";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

// The mocks and the fixtures are in volunteerKit.test.support.tsx and policyKit.test.support.tsx; the
// second loads the first, and both must load before a screen does.
const policyKit = await import("./policyKit.test.support");
const { VolunteerQualifications } = await import("./VolunteerQualifications");
const { VolunteerAssessments } = await import("./VolunteerAssessments");
const { assessmentsCopy } = await import("./assessmentsCopy");
const { assessmentMessageText } = await import("./assessmentsLogic");
const { qualificationsCopy } = await import("./qualificationsCopy");

const { kit, POLICY_ALLOW, POLICY_TEXT, monthlyPolicy, rawKeysIn } = policyKit;

const person = (over: Record<string, unknown> = {}) => ({
  id: "profile-1",
  display_name: POLICY_TEXT.volunteer,
  birth_date: "1990-01-01",
  joined_on: "2025-05-01",
  history_coverage_start: null,
  tier: "newcomer",
  status: "pending",
  revision: 2,
  ...over,
});

const qualificationData = {
  profiles: [
    person(),
    person({ id: "profile-2", tier: "regular", status: "active", birth_date: "" }),
    person({ id: "profile-3", tier: "senior", status: "suspended" }),
  ],
  credentials: [
    {
      id: "credential-1",
      profile_id: "profile-1",
      credential_key: "driving_license",
      valid_from: "2026-01-01T00:00:00Z",
      valid_until: "2027-01-01T00:00:00Z",
      revoked_at: null,
      evidence: POLICY_TEXT.evidence,
    },
    {
      id: "credential-2",
      profile_id: "profile-1",
      credential_key: "socialisation_training",
      valid_from: "2025-01-01T00:00:00Z",
      valid_until: null,
      revoked_at: "2026-06-01T00:00:00Z",
      evidence: "",
    },
    {
      id: "credential-3",
      profile_id: "profile-1",
      credential_key: "forgotten_key",
      valid_from: "2025-01-01T00:00:00Z",
      valid_until: null,
      revoked_at: null,
      evidence: POLICY_TEXT.evidence,
    },
  ],
  credential_definitions: [
    { key: "driving_license", label: POLICY_TEXT.qualifications[1] },
    { key: "socialisation_training", label: POLICY_TEXT.qualifications[0] },
  ],
};

function qualifications(
  language: "en" | "zh",
  profileId = "profile-1",
  data: Record<string, unknown> = { "volunteer-qualifications": kit.ok(qualificationData) },
) {
  let markup = "";
  kit.withQueries(data, () => {
    const element = <VolunteerQualifications initial={{ profileId }} />;
    markup = language === "en" ? renderAdminInEnglish(element) : renderAdminInChinese(element);
  });
  return markup;
}

describe("the qualification verification in English", () => {
  test("shows the list of profiles, the verification of one and its qualifications", () => {
    const markup = qualifications("en");
    expectNoChineseText(markup, { allow: POLICY_ALLOW });
    for (const text of [
      "Volunteer profile and qualification verification",
      "Tiers and course qualifications are only set from verified evidence.",
      "A Remark that a volunteer fills in themselves does not grant a skill.",
      "Back to the volunteer directory",
      "Volunteer calendar",
      'aria-label="Choose a volunteer"',
      "Choose a profile awaiting verification or an existing one",
      `${POLICY_TEXT.volunteer} · Awaiting verification · Newcomer`,
      `${POLICY_TEXT.volunteer} · Verified · Regular`,
      `${POLICY_TEXT.volunteer} · Paused · Senior`,
      `${POLICY_TEXT.volunteer} · Identity verification`,
      "View the full volunteer record and service history",
      "Date of birth: 1 Jan 1990 (Mon)",
      "Verified tier",
      ">Newcomer</option>",
      ">Regular</option>",
      ">Senior</option>",
      "Reason for verifying or correcting, and the source of the evidence",
      "Verified joining date (leave blank if unknown)",
      "Start date of complete attendance records (leave blank if unknown)",
      "Zero attendance can only be judged for months that are verified and completely covered.",
      "Confirm identity and tier",
      "Pause eligibility for new registrations",
      "Verify a course or skill",
      "Valid from (Hong Kong time)",
      "Expiry date (not valid from 00:00 on that day; optional)",
      "Verification evidence record",
      "Save the verified qualification",
      "Check the identity of old registrations",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toContain(`>${POLICY_TEXT.qualifications[1]}</option>`);
  });

  test("lists each qualification with its state and expiry, and offers revoking only the live ones", () => {
    const markup = qualifications("en");
    expect(markup).toContain(
      `${POLICY_TEXT.qualifications[1]} · Verified · 1 Jan 2027 (Fri)<p>${POLICY_TEXT.evidence}</p>`,
    );
    expect(markup).toContain(
      `${POLICY_TEXT.qualifications[0]} · Revoked · No expiry date<p></p></li>`,
    );
    // A qualification the list does not know is unnamed; its key is never shown.
    expect(markup).toContain("Unnamed qualification · Verified · No expiry date");
    expect(markup.replace(/ value="[^"]*"/g, "")).not.toContain("forgotten_key");
    expect(markup.match(/Revoke qualification/g)).toHaveLength(2);
    expect(rawKeysIn(markup)).toEqual([]);
  });

  test("says a birth date is not provided, and nothing for a profile that is not chosen", () => {
    expect(qualifications("en", "profile-2")).toContain("Date of birth: Not provided");
    const none = qualifications("en", "");
    expect(none).not.toContain("Identity verification");
    expect(none).toContain("Check the identity of old registrations");
  });

  test("tells what happened after a change, and what to do when it failed", () => {
    kit.withMutationData({ kind: "ok" }, () => {
      expect(qualifications("en")).toContain(
        '<p role="status">The update is saved. The verification history and the follow-up tasks for future sessions are kept.</p>',
      );
      expect(qualifications("zh")).toContain("更新已保存，核實歷史及未來場次跟進任務已保留。");
    });
    const forbidden = new AdminApiError({
      status: 403,
      message: volunteerServerErrorText("qualifications_forbidden"),
    });
    kit.withMutationError(forbidden, () => {
      const markup = qualifications("en");
      expectNoChineseText(markup, { allow: POLICY_ALLOW });
      expect(markup).toContain(
        '<p role="alert">You do not have permission to verify qualifications. Ask an administrator for access.</p>',
      );
      expect(qualifications("zh")).toContain("沒有核實資格權限");
    });
    kit.withMutationError(
      new AdminApiError({ status: 409, message: "資料已被更新，請重新整理及預覽後再試。" }),
      () => {
        expect(qualifications("en")).toContain(
          "The data has been updated. Refresh the page, preview again and try again.",
        );
      },
    );
  });

  test("says when the profiles are loading or could not be loaded, with a button that has room", () => {
    expect(qualifications("en", "", {})).toContain("<p>Loading…</p>");
    const failed = qualifications("en", "", { "volunteer-qualifications": kit.failed() });
    expect(failed).toContain('<p role="alert">Could not load the profile data. <button');
    expect(failed).toContain(">Reload</button>");
    expectNoChineseText(failed);
    expect(qualifications("zh", "", { "volunteer-qualifications": kit.failed() })).toContain(
      "未能載入身份資料。<button",
    );
  });

  test("keeps the Chinese screen as it was", () => {
    const markup = qualifications("zh");
    for (const text of [
      "義工身份與資格核實",
      "只按已核實證據設定級別及課程資格。自填 Remark 不會授予技能；既有出席及名單會保留。",
      "返回義工名冊",
      "義工月曆",
      'aria-label="選擇義工"',
      "請選擇待核實或已有身份",
      `${POLICY_TEXT.volunteer} · 待核實 · 新手義工`,
      `${POLICY_TEXT.volunteer} · 已核實 · 恆常義工`,
      `${POLICY_TEXT.volunteer} · 暫停 · 資深義工`,
      `${POLICY_TEXT.volunteer} · 身份核實`,
      "查看完整義工檔案及服務紀錄",
      "出生日期：1990-01-01",
      "核實級別",
      "核實／更正理由與證據來源",
      "已核實加入日期（不詳留空）",
      "完整出席紀錄覆蓋起日（不詳留空）",
      "只有已核實且完整覆蓋的月份才可判斷零出席。請在理由記錄日期及覆蓋範圍的證據來源。",
      "確認身份及級別",
      "暫停新報名資格",
      "核實課程／技能",
      "有效起日（香港時間）",
      "到期日（該日零時失效；可留空）",
      "核實證據紀錄",
      "儲存已核實資格",
      `${POLICY_TEXT.qualifications[1]} · 已核實 · ${new Date("2027-01-01T00:00:00Z").toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" })}`,
      `${POLICY_TEXT.qualifications[0]} · 已撤銷 · 未設到期日`,
      "撤銷資格",
      "舊報名身份核對",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(qualifications("zh", "profile-2")).toContain("出生日期：未提供");
    expect(qualifications("zh", "", {})).toContain("<p>載入中…</p>");
  });

  test("has English copy with no Chinese", () => {
    expectNoChineseInCopy(qualificationsCopy.en);
  });
});

const NOW = () => new Date("2026-10-09T04:00:00Z");

const listing = {
  available_channels: ["email"],
  senior_candidates: [
    {
      id: "c1",
      profile_id: "p1",
      trigger_kind: "verified_attendance",
      detected_at: "2026-10-09T02:00:00Z",
      profile: { display_name: POLICY_TEXT.volunteer },
    },
    {
      id: "c2",
      profile_id: "p2",
      trigger_kind: "monthly_assessment",
      detected_at: "2026-10-08T02:00:00Z",
      profile: null,
    },
  ],
  assessments: [
    { id: "a1", period_start: "2026-09-01", scope_key: "combined", completed_at: "2026-10-01" },
    { id: "a2", period_start: "2026-08-01", scope_key: "cat", completed_at: "2026-09-01" },
    { id: "a3", period_start: "2026-07-01", scope_key: "dog", completed_at: "2026-08-01" },
    {
      id: "a4",
      period_start: "2026-06-01",
      scope_key: "mystery_scope",
      completed_at: "2026-07-01",
    },
  ],
};

const jobs = [
  {
    id: "j1",
    kind: "volunteer_monthly_assessment_notification",
    status: "failed",
    attempts: 3,
    available_at: "2026-10-09T01:00:00Z",
    last_error: kit.FIXTURE.error,
  },
  {
    id: "j2",
    kind: "volunteer_policy_reminder",
    status: "delivered",
    attempts: 1,
    available_at: "2026-10-09T01:00:00Z",
    last_error: null,
  },
  {
    id: "j3",
    kind: "some_future_kind",
    status: "some_future_status",
    attempts: 1234,
    available_at: "2026-10-09T01:00:00Z",
    last_error: null,
  },
];

type AssessmentsInitial = NonNullable<Parameters<typeof VolunteerAssessments>[0]>["initial"];

function assessments(language: "en" | "zh", initial: AssessmentsInitial = {}) {
  const element = (
    <VolunteerAssessments
      now={NOW}
      initial={{
        policy: monthlyPolicy(),
        revision: 4,
        data: listing,
        jobs,
        ...initial,
      }}
    />
  );
  return language === "en" ? renderAdminInEnglish(element) : renderAdminInChinese(element);
}

describe("the monthly tier assessment in English", () => {
  test("shows the settings, the run, the candidates and the notification jobs", () => {
    const markup = assessments("en");
    expectNoChineseText(markup, { allow: POLICY_ALLOW });
    for (const text of [
      "Monthly volunteer tier assessment",
      ">Assessment settings</a>",
      ">Run the assessment</a>",
      ">Approve candidates</a>",
      ">Notification status</a>",
      "All times are in Hong Kong time.",
      "Attendances needed to be promoted to regular",
      "Years of service needed to be senior",
      "Months of observation as regular before senior",
      "How attendance is counted",
      ">Once per day</option>",
      ">Each verified, non-overlapping time slot</option>",
      "Venue scope",
      ">Cats and dogs combined</option>",
      ">Cats and dogs separate</option>",
      "When promotion is assessed",
      ">At each verified attendance</option>",
      ">At the monthly assessment</option>",
      "Monthly minimum for regular volunteers",
      "Monthly minimum for senior volunteers",
      "Months with no attendance before a reminder to regular volunteers",
      "Months with no attendance before a reminder to senior volunteers",
      "Day of the month to run",
      "Hong Kong time",
      "Reminder text for regular volunteers",
      "Care message for senior volunteers",
      "Enable the notification queue",
      "Email (configured)",
      "Test mode (only builds the queue and sends nothing)",
      "Save draft",
      ">Preview</button>",
      'aria-label="Effective date of the assessment policy"',
      'value="2026-10-09"',
      'placeholder="Reason for publishing"',
      "Publish version",
      "Run a completed month",
      'aria-label="Completed month to assess"',
      'aria-label="Assessment scope"',
      ">Cat shelter</option>",
      ">Dog shelter</option>",
      "Run assessment",
      "Senior volunteer candidates (staff must approve)",
      "Candidates are only found from the published policy",
      "Notification jobs",
      "A provider accepting a message does not mean it was delivered.",
    ]) {
      expect(markup, text).toContain(text);
    }
    // The staff members' text is as they typed it.
    expect(markup).toContain(`>${POLICY_TEXT.reminder}</textarea>`);
    expect(markup).toContain(`>${POLICY_TEXT.care}</textarea>`);
  });

  test("says the email is not set up when the server has no email channel", () => {
    expect(assessments("en", { data: { ...listing, available_channels: [] } })).toContain(
      "Email (not configured; test mode only)",
    );
  });

  test("writes a finished assessment, a candidate and a job with names instead of codes", () => {
    const markup = assessments("en");
    for (const text of [
      "1 Sep 2026 (Tue) · Cats and dogs combined · Completed",
      "1 Aug 2026 (Sat) · Cat shelter · Completed",
      "1 Jul 2026 (Wed) · Dog shelter · Completed",
      "1 Jun 2026 (Mon) · Other scope · Completed",
      `Volunteer ${POLICY_TEXT.volunteer} · Triggered by a verified attendance · 9 Oct 2026 (Fri) 10:00`,
      "Volunteer No name entered · Triggered by the monthly assessment · 8 Oct 2026 (Thu) 10:00",
      "Monthly attendance reminder · Failed · Attempts: 3",
      "Service reminder · Delivery evidence received · Attempts: 1",
      "Notification · Unknown status · Attempts: 1,234",
    ]) {
      expect(markup, text).toContain(text);
    }
    // The error text of a job is as the server stored it; only a failed job can be queued again.
    expect(markup).toContain(`<span class="text-[var(--color-error)]">${kit.FIXTURE.error}</span>`);
    expect(markup.match(/Queue again/g)).toHaveLength(1);
    for (const code of ["mystery_scope", "some_future", "volunteer_monthly", "volunteer_policy"]) {
      expect(markup, code).not.toContain(code);
    }
    expect(rawKeysIn(markup)).toEqual([]);
  });

  test("starts the effective date from the clock it is given, in whichever language", () => {
    const later = (
      <VolunteerAssessments
        now={() => new Date("2027-01-31T23:30:00Z")}
        initial={{ data: listing }}
      />
    );
    expect(renderAdminInEnglish(later)).toContain('value="2027-01-31"');
    expect(renderAdminInChinese(later)).toContain('value="2027-01-31"');
  });

  test("tells what the page last did, and what to do about a failure", () => {
    const say = (message: NonNullable<AssessmentsInitial>["message"]) =>
      assessments("en", { message });
    for (const [code, text] of [
      ["draft_saved", "Draft saved."],
      ["preview_ready", "The preview passed. You can publish."],
      [
        "preview_blocked",
        "Some settings are still undecided, so the policy cannot be published yet.",
      ],
      ["published", "The version is published."],
      ["requeued", "The notification is queued again."],
    ] as const) {
      expect(say({ code }), code).toContain(`<p role="status">${text}</p>`);
    }
    expect(say({ code: "run_done", profiles: 1 })).toContain(
      "Assessment finished for 1 person. Notifications are queued and are not marked as delivered.",
    );
    expect(say({ code: "run_done", profiles: 1500 })).toContain(
      "Assessment finished for 1,500 people.",
    );
    const forbidden = new AdminApiError({
      status: 403,
      message: volunteerServerErrorText("assessments_forbidden"),
    });
    expect(say({ code: "error", cause: forbidden })).toContain(
      "You do not have permission to change the monthly assessment. Ask an administrator for access.",
    );
    expect(
      assessmentMessageText(
        { code: "error", cause: new AdminApiError({ status: 500, message: "未能處理每月評核" }) },
        "en",
      ),
    ).toBe("Could not process the monthly assessment. Reload the page and try again.");
    expect(
      assessmentMessageText({ code: "error", cause: new Error("Failed to fetch") }, "en"),
    ).toBe("Failed to fetch");
    const unreadable = monthlyPolicySchema.safeParse({ nonsense: true }).error as ZodError;
    expect(assessmentMessageText({ code: "error", cause: unreadable }, "en")).toBe(
      "The saved assessment settings could not be read. Reload the page. If it happens again, ask an administrator to check the settings.",
    );
    expect(assessmentMessageText({ code: "error", cause: unreadable }, "zh")).toBe(
      unreadable.message,
    );
    expect(assessmentMessageText({ code: "error", cause: "no message at all" }, "en")).toBe(
      "The action failed. Try again.",
    );
    expect(assessmentMessageText({ code: "error", cause: "no message at all" }, "zh")).toBe("");
    expectNoChineseText(say({ code: "error", cause: forbidden }), { allow: POLICY_ALLOW });
  });

  test("keeps the Chinese page as it was, including the codes it has always shown", () => {
    const markup = assessments("zh", { message: { code: "run_done", profiles: 7 } });
    for (const text of [
      "每月義工級別評核",
      ">評核設定</a>",
      ">執行評核</a>",
      ">候選核准</a>",
      ">通知狀態</a>",
      "所有時段以香港時間計算。未知歷史覆蓋不會當作零出席，資深義工不會自動降級。",
      "晉升恆常累積出席",
      "資深年資",
      "資深恆常觀察月數",
      "出席計算",
      ">同日只計一次</option>",
      ">每個核實且不重疊時段</option>",
      "場地範圍",
      ">貓狗合計</option>",
      ">貓狗分開</option>",
      "晉升評核時點",
      ">每次核實出席</option>",
      ">每月評核</option>",
      "恆常每月最低",
      "資深每月最低",
      "恆常提醒相隔零出席月數",
      "資深提醒相隔零出席月數",
      "每月執行日",
      "恆常提醒內容",
      "資深關懷內容",
      "啟用通知佇列",
      "電郵（已配置）",
      "測試模式（只建立佇列，不會發送）",
      "儲存草稿",
      ">預覽</button>",
      'aria-label="評核政策生效日期"',
      'placeholder="發布原因"',
      "發布版本",
      "執行已完成月份",
      'aria-label="已完成評核月份"',
      'aria-label="評核範圍"',
      ">貓舍</option>",
      ">狗舍</option>",
      "執行評核",
      "資深義工候選（須人手核准）",
      "候選只按已發布政策及已核實年資／恆常觀察證據產生，不會自動晉升。",
      "通知工作",
      "供應商接受不等於已送達；只有回傳送達證據才會顯示已送達。",
      // The lists show the stored values, as they always did.
      "2026-09-01 · combined · 已完成",
      "2026-08-01 · cat · 已完成",
      `義工 ${POLICY_TEXT.volunteer} · 核實出席觸發 · 2026-10-09T02:00:00Z`,
      "義工 未命名義工 · 每月評核觸發 · 2026-10-08T02:00:00Z",
      "volunteer_monthly_assessment_notification · failed · 嘗試 3",
      "重新排隊",
      "評核完成：7 人；通知已排入佇列，未標示為已送達",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(assessments("zh", { message: { code: "draft_saved" } })).toContain("草稿已儲存");
    expect(assessments("zh", { data: { available_channels: [] } })).toContain(
      "電郵（未配置；只可測試）",
    );
  });

  test("has English copy with no Chinese", () => {
    expectNoChineseInCopy(assessmentsCopy.en);
    expect(assessmentsCopy.en.run.scopeName("combined")).toBe("Cats and dogs combined");
    expect(assessmentsCopy.zh.run.scopeName("combined")).toBe("combined");
  });
});

describe("the assessments route", () => {
  test("shows the assessment page inside the volunteer shell, for those who manage the policy", () => {
    const source = readFileSync(
      new URL("../../../routes/admin/volunteers/assessments.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('createFileRoute("/admin/volunteers/assessments")');
    expect(source).toContain('requireAdminPageAccess("volunteerPolicyManagement"');
    expect(source).toContain("<VolunteerAdminShell>");
    expect(source).toContain("<VolunteerAssessments />");
  });
});
