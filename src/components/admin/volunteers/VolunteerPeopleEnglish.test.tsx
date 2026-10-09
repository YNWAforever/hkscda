import { describe, expect, test } from "bun:test";

import { AdminApiError } from "../../../lib/admin/session";
import { formatAdminDate } from "../i18n/format";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

// The mocks and the fixtures are in volunteerKit.test.support.tsx; it must load before a screen does.
const kit = await import("./volunteerKit.test.support");
const { DirectoryResults, VolunteerDirectory } = await import("./VolunteerDirectory");
const { VolunteerReviewBulkPanel } = await import("./VolunteerReviewBulkPanel");
const { PersonRecords, VolunteerPersonDetail } = await import("./VolunteerPersonDetail");
const { QualificationProfileSearch } = await import("./QualificationProfileSearch");
const { VolunteerLegacyReconciliation } = await import("./VolunteerLegacyReconciliation");
const { volunteerDirectoryCopy } = await import("./volunteerDirectoryCopy");
const { volunteerPersonCopy } = await import("./volunteerPersonCopy");
const { legacyReconciliationCopy } = await import("./legacyReconciliationCopy");

const { FIXTURE } = kit;
const ALLOW = [FIXTURE.volunteer, FIXTURE.role, FIXTURE.evidence, FIXTURE.reason, FIXTURE.activity];
const noop = () => {};
const selection = { ids: ["profile-1"], disabled: false, toggle: noop };
/** A date as the Chinese person page has always written it (the ICU data decides the exact text). */
const zhDate = (value: string) =>
  new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium", timeZone: "Asia/Hong_Kong" }).format(
    new Date(value),
  );

const users = {
  users: [
    { authUserId: "user-1", email: "admin@example.test", role: "admin", status: "active" },
    { authUserId: "user-2", email: "staff@example.test", role: "staff", status: "active" },
    { authUserId: "user-3", email: "treasurer@example.test", role: "treasurer", status: "active" },
    { authUserId: "user-4", email: "gone@example.test", role: "staff", status: "disabled" },
  ],
};

describe("the volunteer directory in English", () => {
  test("shows each profile, its status and tier, and the links, without Chinese", () => {
    const markup = renderAdminInEnglish(
      <DirectoryResults
        data={{ profiles: kit.directoryProfiles, total: 51, page: 2, limit: 25 } as never}
        search={{ q: "fixture", page: 2 }}
        selection={selection}
      />,
    );
    expectNoChineseText(markup, { allow: ALLOW });
    for (const text of [
      "51 volunteers · Page 2 of 3 · Includes profiles with no registration",
      FIXTURE.volunteer,
      "No name entered",
      "Awaiting verification",
      "Enabled",
      "Paused",
      "Newcomer",
      "Regular",
      "Senior",
      "Email verified",
      "Email not verified",
      "No linked account email",
      "Account not linked",
      "No email provided",
      "Staff identity verification: Awaiting verification",
      "Staff identity verification: Verified",
      "Profile reference: profile-1",
      "View details",
      'aria-label="View details for No name entered"',
      "Previous page",
      "Next page",
      `aria-label="Select ${FIXTURE.volunteer}"`,
      'aria-label="Select profile-2"',
      'aria-label="Volunteer directory pages"',
      "/admin/volunteers/people/profile-1?",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("writes a long list's count with a thousands separator in English only", () => {
    const data = { profiles: kit.directoryProfiles, total: 1051, page: 1, limit: 25 } as never;
    expect(renderAdminInEnglish(<DirectoryResults data={data} search={{ page: 1 }} />)).toContain(
      "1,051 volunteers · Page 1 of 43",
    );
    expect(renderAdminInChinese(<DirectoryResults data={data} search={{ page: 1 }} />)).toContain(
      "共 1051 位義工 · 第 1 / 43 頁",
    );
  });

  test("says why the list is empty, and writes one volunteer as one volunteer", () => {
    const empty = { profiles: [], total: 0, page: 1, limit: 25 } as never;
    const searched = renderAdminInEnglish(
      <DirectoryResults data={empty} search={{ q: "x", page: 1 }} />,
    );
    expect(searched).toContain("No volunteers match your filters");
    expect(searched).toContain("Change the search terms or clear the filters, then try again.");
    const none = renderAdminInEnglish(<DirectoryResults data={empty} search={{ page: 1 }} />);
    expect(none).toContain("There are no volunteer profiles yet");
    expect(none).toContain("including people who have not registered.");
    const one = renderAdminInEnglish(
      <DirectoryResults
        data={
          { profiles: kit.directoryProfiles.slice(0, 1), total: 1, page: 1, limit: 25 } as never
        }
        search={{ page: 1 }}
      />,
    );
    expect(one).toContain("1 volunteer · Page 1 of 1");
  });

  test("shows the search form, and the selection and assignment controls to an administrator only", () => {
    const queries = {
      "volunteer-directory": kit.ok({
        profiles: kit.directoryProfiles,
        total: 51,
        page: 1,
        limit: 25,
      }),
      "admin-access-users": kit.ok(users),
    };
    kit.state.role = "admin";
    kit.withQueries(queries, () => {
      const markup = renderAdminInEnglish(
        <VolunteerDirectory search={{ q: "fixture", tier: "senior", page: 1 }} />,
      );
      expectNoChineseText(markup, { allow: ALLOW });
      for (const text of [
        "Name or account email",
        'placeholder="Search a full or partial name or email"',
        "Profile status",
        "All profiles",
        "Volunteer tier",
        "All tiers",
        "Search",
        "Clear filters",
        "Email verification only means the account email is confirmed.",
        "Select this page",
        "Select all matches (up to 1,000)",
        "Clear selection",
        "Bulk assign volunteer profile reviewers",
      ]) {
        expect(markup, text).toContain(text);
      }
      expect(markup).toContain('value="senior" selected=""');
    });
    kit.state.role = "staff";
    kit.withQueries(queries, () => {
      const markup = renderAdminInEnglish(<VolunteerDirectory search={{ page: 1 }} />);
      expectNoChineseText(markup, { allow: ALLOW });
      expect(markup).not.toContain("Select this page");
      expect(markup).not.toContain("Bulk assign volunteer profile reviewers");
      expect(markup).not.toContain('type="checkbox"');
    });
    kit.state.role = "admin";
  });

  test("tells the loading and the failure in English with a next step", () => {
    kit.withQueries({}, () => {
      expect(renderAdminInEnglish(<VolunteerDirectory search={{ page: 1 }} />)).toContain(
        "Loading the volunteer directory…",
      );
    });
    kit.withQueries({ "volunteer-directory": kit.failed() }, () => {
      const markup = renderAdminInEnglish(<VolunteerDirectory search={{ page: 1 }} />);
      expectNoChineseText(markup);
      expect(markup).toContain(
        "Could not load the volunteer directory. Your search terms are kept. Reload to try again.",
      );
      expect(markup).toContain(">Reload</button>");
    });
  });

  test("has English text for every string in the copy, and the Chinese directory stays as it was", () => {
    expectNoChineseInCopy(volunteerDirectoryCopy.en);
    kit.withQueries(
      {
        "volunteer-directory": kit.ok({
          profiles: kit.directoryProfiles,
          total: 51,
          page: 2,
          limit: 25,
        }),
        "admin-access-users": kit.ok(users),
      },
      () => {
        const markup = renderAdminInChinese(<VolunteerDirectory search={{ page: 2 }} />);
        for (const text of [
          "姓名或帳戶電郵",
          "搜尋完整或部分姓名／電郵",
          "身份狀態",
          "全部身份",
          "義工級別",
          "清除篩選",
          "電郵驗證只代表帳戶電郵已確認",
          "選取本頁",
          "選取全部符合條件（最多 1000 筆）",
          "共 51 位義工 · 第 2 / 3 頁 · 包括未曾報名的身份",
          "未填姓名",
          "待核實",
          "已啟用",
          "已暫停",
          "新手義工",
          "恆常義工",
          "資深義工",
          "電郵已驗證",
          "電郵未驗證",
          "沒有已連結的帳戶電郵",
          "帳戶未連結",
          "未提供電郵",
          "職員身份核實：待核實",
          "職員身份核實：已核實",
          "身份編號：profile-1",
          "查看個人詳情",
          `aria-label="選取 ${FIXTURE.volunteer}"`,
          'aria-label="義工名冊分頁"',
        ]) {
          expect(markup, text).toContain(text);
        }
      },
    );
  });
});

describe("the reviewer assignment panel in English", () => {
  test("lists the active staff and administrators and counts what is selected", () => {
    kit.withQueries({ "admin-access-users": kit.ok(users) }, () => {
      const markup = renderAdminInEnglish(
        <VolunteerReviewBulkPanel
          selectedIds={["a", "b"]}
          filterKey="k"
          selectionDisabled={false}
        />,
      );
      expectNoChineseText(markup);
      for (const text of [
        'aria-label="Bulk assignment of volunteer profile reviewers"',
        "Bulk assign volunteer profile reviewers",
        "This only assigns the review work.",
        "The preview is valid for 15 minutes",
        "Choose an active staff member",
        "admin@example.test",
        "staff@example.test",
        "2 selected (up to 1,000)",
        "Create assignment preview",
      ]) {
        expect(markup, text).toContain(text);
      }
      expect(markup).not.toContain("treasurer@example.test");
      expect(markup).not.toContain("gone@example.test");
    });
    kit.withQueries({ "admin-access-users": kit.failed() }, () => {
      const markup = renderAdminInEnglish(
        <VolunteerReviewBulkPanel selectedIds={[]} filterKey="k" selectionDisabled />,
      );
      expectNoChineseText(markup);
      expect(markup).toContain("Could not load the reviewer list. Reload the page and try again.");
      expect(markup).toContain("0 selected (up to 1,000)");
    });
  });

  test("has English text for the problems the panel can report, and keeps the Chinese panel", () => {
    const { errors } = volunteerDirectoryCopy.en.reviewPanel;
    for (const text of Object.values(errors)) {
      expect(text.length).toBeGreaterThan(20);
      expect(text.endsWith(".")).toBe(true);
    }
    expect(volunteerDirectoryCopy.en.reviewPanel.reviewTitle("staff@example.test", 1)).toBe(
      "Reviewer: staff@example.test · 1 item",
    );
    expect(volunteerDirectoryCopy.en.reviewPanel.reviewTitle("staff@example.test", 30)).toBe(
      "Reviewer: staff@example.test · 30 items",
    );
    kit.withQueries({ "admin-access-users": kit.ok(users) }, () => {
      const markup = renderAdminInChinese(
        <VolunteerReviewBulkPanel
          selectedIds={["a", "b"]}
          filterKey="k"
          selectionDisabled={false}
        />,
      );
      for (const text of [
        'aria-label="義工審核者批量分派"',
        "批量分派義工身份審核者",
        "預覽有效 15 分鐘，套用時逐筆重新核對身份版本及職員權限。",
        "選擇已啟用的職員",
        "已選 2 筆（上限 1000）",
        "建立分派預覽",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
  });
});

describe("a volunteer's person page in English", () => {
  const search = { q: "fixture", page: 3 };
  const render = (data: unknown, tab: string) =>
    renderAdminInEnglish(<PersonRecords data={data as never} search={search} initialTab={tab} />);

  test("shows the header, the coverage note and the profile and qualification tab", () => {
    const markup = render(kit.personDetail(), "identity");
    expectNoChineseText(markup, { allow: ALLOW });
    for (const text of [
      "Back to the directory",
      "Verify identity and qualifications",
      "qualifications?profile_id=profile-1",
      "page=3",
      FIXTURE.volunteer,
      "Enabled",
      "Regular",
      "Account email: Email verified · Staff identity verification: Verified on 1 Sep 2026 (Tue)",
      "Profile reference: profile-1",
      "Record coverage",
      "History coverage starts on 1 Jan 2025 (Wed). Only records linked to this profile are shown.",
      "Up to 100 records are shown for each type.",
      'aria-label="Record categories"',
      "Profile and qualifications",
      "Registrations",
      "Attendance and service records",
      "Verification records",
      "Profile details",
      "Date of birth",
      "1 Jan 1990 (Mon)",
      "Joined on",
      "1 May 2025 (Thu)",
      "Qualification evidence",
      "Showing 2 of 3",
      "Valid from 1 Jan 2026 (Thu) to 1 Jan 2027 (Fri)",
      "Valid from 1 Jan 2025 (Wed) to no expiry date set",
      "· Revoked",
      "Revoked on 1 Jun 2026 (Mon)",
      "Evidence: " + FIXTURE.evidence,
      "Evidence: not provided",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("shows the registrations, with a label for a status it knows and 'other status' for one it does not", () => {
    const markup = render(kit.personDetail(), "registrations");
    expectNoChineseText(markup, { allow: ALLOW });
    for (const text of [
      "Showing 2 of 12 registrations",
      "10 Oct 2026 (Sat) · Approved",
      "Attendance: Completed · Service hours: 3 hours",
      "11 Oct 2026 (Sun) · Other status",
      "Attendance: Other status · Service hours: not recorded",
      "View and handle registration",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("mystery");
  });

  test("shows the attendance records before and after each correction", () => {
    const markup = render(kit.personDetail(), "attendance");
    expectNoChineseText(markup, { allow: ALLOW });
    for (const text of [
      "Showing 2 of 7 attendance records. Hours are only taken from recorded values",
      "Attendance correction · 10 Oct 2026 (Sat)",
      "Before the change: <span>Attended · 2 hours</span>",
      "After the change: <span>Completed · 3 hours</span>",
      "Reason: " + FIXTURE.reason,
      "Attendance record · 11 Oct 2026 (Sun)",
      "<span>Attendance status not recorded · Service hours not recorded</span>",
      "<span>Other status · Service hours not recorded</span>",
      "Reason: no reason recorded",
      "View related registration",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("0 hours");
  });

  test("shows the verification records with a label for each event", () => {
    const markup = render(kit.personDetail(), "audit");
    expectNoChineseText(markup, { allow: ALLOW });
    for (const text of [
      "Showing 7 of 9 verification records",
      "Account linked",
      "Identity verified",
      "Profile paused",
      "Qualification granted",
      "Qualification revoked",
      "Profile updated",
      "Other status",
      "No reason recorded",
      "Handled by staff member: actor-0",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("says so when there is nothing to show, and does not make up a date or hours", () => {
    const bare = kit.personDetail({
      credentials: [],
      registrations: [],
      attendance_events: [],
      verification_history: [],
      profile: kit.profile({
        account_linked: false,
        linked_email: null,
        display_name: "",
        birth_date: null,
        joined_on: null,
      }),
      coverage: {
        history_coverage_start: null,
        registration_total: 0,
        attendance_event_total: 0,
        verification_event_total: 0,
        credential_total: 0,
        records_limit: 100,
        scope: "linked_profile_records_only",
      },
    });
    const identity = render(bare, "identity");
    expectNoChineseText(identity);
    for (const text of [
      "No name entered",
      "Account not linked",
      "Account email: Not linked · Staff identity verification: Awaiting verification",
      "No history coverage start date is set.",
      "Not recorded",
      "No qualification evidence is recorded.",
    ]) {
      expect(identity, text).toContain(text);
    }
    expect(render(bare, "registrations")).toContain("No registrations are linked yet.");
    expect(render(bare, "attendance")).toContain("No linked attendance records.");
    expect(render(bare, "audit")).toContain("No linked verification records.");
  });

  test("tells the loading and the failure in English", () => {
    kit.withQueries({}, () => {
      expect(
        renderAdminInEnglish(<VolunteerPersonDetail profileId="p" search={search} />),
      ).toContain("Loading volunteer records…");
    });
    kit.withQueries({ "volunteer-directory": kit.failed() }, () => {
      const markup = renderAdminInEnglish(<VolunteerPersonDetail profileId="p" search={search} />);
      expectNoChineseText(markup);
      expect(markup).toContain("Could not load the volunteer records.");
      expect(markup).toContain("Reload to try again, or go back to the directory.");
      expect(markup).toContain(">Reload</button>");
      expect(markup).toContain("Back to the directory");
    });
    kit.withQueries({ "volunteer-directory": kit.ok(kit.personDetail()) }, () => {
      expect(
        renderAdminInEnglish(<VolunteerPersonDetail profileId="p" search={search} />),
      ).toContain("Profile details");
    });
  });

  test("has English text for every string in the copy and uses the Hong Kong date format", () => {
    expectNoChineseInCopy(volunteerPersonCopy.en);
    expect(formatAdminDate("2026-09-01T02:00:00Z", "en")).toBe("1 Sep 2026 (Tue)");
  });

  test("keeps the Chinese person page as it was", () => {
    const identity = renderAdminInChinese(
      <PersonRecords data={kit.personDetail() as never} search={search} initialTab="identity" />,
    );
    for (const text of [
      "返回名冊",
      "核實身份與資格",
      "帳戶電郵：電郵已驗證 · 職員身份核實：已核實（" + zhDate("2026-09-01T02:00:00Z") + "）",
      "身份編號：profile-1",
      "紀錄覆蓋範圍",
      "歷史覆蓋起點：" +
        zhDate("2025-01-01") +
        "。只顯示已連結此身份的紀錄；未連結的舊資料不會按姓名推測合併。每類最多顯示 100 筆；缺少紀錄不代表沒有服務或資格。",
      'aria-label="個人紀錄分類"',
      "身份與資格",
      "出生日期",
      "顯示 2 / 3 筆",
      "有效期間：" + zhDate("2026-01-01") + " 至 " + zhDate("2027-01-01"),
      "有效期間：" + zhDate("2025-01-01") + " 至 未設定到期日",
      "· 已撤銷",
      "撤銷日期：",
      "證據：" + FIXTURE.evidence,
      "證據：未提供",
    ]) {
      expect(identity, text).toContain(text);
    }
    const attendance = renderAdminInChinese(
      <PersonRecords data={kit.personDetail() as never} search={search} initialTab="attendance" />,
    );
    for (const text of [
      "出席更正 · ",
      "更改前：<span>已出席 · 2 小時</span>",
      "更改後：<span>已完成 · 3 小時</span>",
      "<span>未記錄出席狀態 · 服務時數未記錄</span>",
      "<span>其他狀態（mystery_attendance） · 服務時數未記錄</span>",
      "原因：未記錄原因",
    ]) {
      expect(attendance, text).toContain(text);
    }
  });
});

describe("the profile search of the verification page in English", () => {
  test("shows the results with the status of each, and says when there are more than are shown", () => {
    kit.withQueries(
      {
        "volunteer-directory": kit.ok({
          profiles: kit.directoryProfiles.slice(0, 3),
          total: 12,
          page: 1,
          limit: 10,
        }),
      },
      () => {
        const markup = renderAdminInEnglish(<QualificationProfileSearch onSelect={noop} />);
        expectNoChineseText(markup, { allow: ALLOW });
        for (const text of [
          "Find a volunteer to verify",
          "Search by name or email. Volunteers with no session registration can be found too.",
          "Search volunteers by name or email",
          'placeholder="Name or email"',
          "Found 12 volunteers. The first 10 are shown below. Enter a fuller name or email.",
          "Awaiting verification · Choose",
          "Verified · Choose",
          "Paused · Choose",
          "No linked email",
        ]) {
          expect(markup, text).toContain(text);
        }
      },
    );
    kit.withQueries(
      { "volunteer-directory": kit.ok({ profiles: [], total: 1, page: 1, limit: 10 }) },
      () => {
        expect(renderAdminInEnglish(<QualificationProfileSearch onSelect={noop} />)).toContain(
          "Found 1 volunteer</p>",
        );
      },
    );
  });

  test("says when the search is running or did not finish, with a retry", () => {
    kit.withQueries({ "volunteer-directory": { isFetching: true } }, () => {
      expect(renderAdminInEnglish(<QualificationProfileSearch onSelect={noop} />)).toContain(
        "Searching…",
      );
    });
    kit.withQueries({ "volunteer-directory": kit.failed() }, () => {
      const markup = renderAdminInEnglish(<QualificationProfileSearch onSelect={noop} />);
      expect(markup).toContain("The search did not finish.");
      expect(markup).toContain(">Retry</button>");
    });
  });

  test("keeps the Chinese search as it was", () => {
    kit.withQueries(
      {
        "volunteer-directory": kit.ok({
          profiles: kit.directoryProfiles.slice(0, 3),
          total: 12,
          page: 1,
          limit: 10,
        }),
      },
      () => {
        const markup = renderAdminInChinese(<QualificationProfileSearch onSelect={noop} />);
        for (const text of [
          "尋找需要核實的義工",
          "按姓名或電郵搜尋，沒有場次報名也能找到。",
          "找到 12 位義工，以下顯示首 10 位；請輸入更完整的姓名或電郵。",
          "待核實 · 選擇",
          "已核實 · 選擇",
          "暫停 · 選擇",
          "未有連結電郵",
        ]) {
          expect(markup, text).toContain(text);
        }
      },
    );
  });
});

describe("matching an old registration to a profile in English", () => {
  const rows = [
    {
      id: "legacy-1",
      contact_name: FIXTURE.volunteer,
      contact_email: "old@example.test",
      title: FIXTURE.activity,
      starts_at: "2026-05-01T02:00:00Z",
      status: "pending",
      updated_at: "2026-05-01T00:00:00Z",
      policy_bound: true,
    },
  ];
  const profiles = [
    { id: "profile-1", display_name: FIXTURE.volunteer, status: "active" },
    { id: "profile-2", display_name: FIXTURE.role, status: "pending" },
  ];

  test("shows the list, the choice of profile and the evidence field", () => {
    kit.withQueries({ "volunteer-legacy-identities": kit.ok({ registrations: rows }) }, () => {
      const markup = renderAdminInEnglish(<VolunteerLegacyReconciliation profiles={profiles} />);
      expectNoChineseText(markup, { allow: ALLOW });
      for (const text of [
        "Check the identity of old registrations",
        "Only link a registration to a profile when there is evidence it is the same person.",
        "Individual registration to check",
        FIXTURE.volunteer + " · " + FIXTURE.activity + " · 1 May 2026 (Fri)",
        "Verified volunteer",
        "Choose a verified profile",
        "Evidence that the identity matches, and the reason for the match",
        "Record the check and link the profile",
      ]) {
        expect(markup, text).toContain(text);
      }
      expect(markup).not.toContain(FIXTURE.role);
    });
  });

  test("tells the loading, the failure and a refused link in English with a next step", () => {
    kit.withQueries({}, () => {
      expect(renderAdminInEnglish(<VolunteerLegacyReconciliation profiles={[]} />)).toContain(
        "Loading the list to check…",
      );
    });
    kit.withQueries({ "volunteer-legacy-identities": kit.failed() }, () => {
      const markup = renderAdminInEnglish(<VolunteerLegacyReconciliation profiles={[]} />);
      expect(markup).toContain("Could not load the list to check. Reload to try again.");
      expect(markup).toContain(">Reload</button>");
    });
    kit.withQueries({ "volunteer-legacy-identities": kit.ok({ registrations: rows }) }, () => {
      kit.withMutationError(
        new AdminApiError({ status: 500, message: "未能更新資格，請重新整理後重試" }),
        () => {
          const markup = renderAdminInEnglish(
            <VolunteerLegacyReconciliation profiles={profiles} />,
          );
          expectNoChineseText(markup, { allow: ALLOW });
          expect(markup).toContain(
            "Could not update the qualification. Refresh the page and try again.",
          );
        },
      );
    });
  });

  test("keeps a space between the sentences about a chosen registration", () => {
    const { contact, policyBound, policyNotBound } = legacyReconciliationCopy.en;
    expect(contact("old@example.test") + policyBound).toContain(
      "Original registration contact: old@example.test. A policy applies.",
    );
    expect(contact("old@example.test") + policyNotBound).toContain(
      "old@example.test. No policy is linked yet.",
    );
    expect(legacyReconciliationCopy.zh.contact("old@example.test")).toBe(
      "原報名聯絡：old@example.test。",
    );
    expectNoChineseInCopy(legacyReconciliationCopy.en);
  });

  test("keeps the Chinese screen as it was", () => {
    kit.withQueries({ "volunteer-legacy-identities": kit.ok({ registrations: rows }) }, () => {
      const markup = renderAdminInChinese(<VolunteerLegacyReconciliation profiles={profiles} />);
      for (const text of [
        "舊報名身份核對",
        "只連結有證據的同一人，不會以相同姓名或電郵自動合併。",
        "待核對個人報名",
        FIXTURE.volunteer +
          " · " +
          FIXTURE.activity +
          " · " +
          new Date("2026-05-01T02:00:00Z").toLocaleDateString("zh-HK", {
            timeZone: "Asia/Hong_Kong",
          }),
        "已核實義工",
        "請選擇已核實身份",
        "身份相符證據及核對理由",
        "記錄核對並連結身份",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
  });
});
