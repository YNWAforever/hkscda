import { describe, expect, test } from "bun:test";

import {
  collectCopyStrings,
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

// The mocks and the fixtures are in volunteerKit.test.support.tsx; it must load before a screen does.
const kit = await import("./volunteerKit.test.support");
const { VolunteerAdminShell } = await import("../VolunteerAdminShell");
const { VOLUNTEER_WORKSPACE_PAGES, getVolunteerNavigation } = await import("../volunteerWorkspace");
const { volunteerWorkspaceCopy } = await import("../volunteerWorkspaceCopy");
const { VolunteerOverview } = await import("./VolunteerOverview");
const { volunteerOverviewCopy } = await import("./volunteerOverviewCopy");
const { WorkflowSections } = await import("./WorkflowSections");

// The language toggle names each language in its own language, so it keeps this one word.
const TOGGLE_WORD = "中文";
const { FIXTURE } = kit;

function shell(pathname: string, props: Record<string, unknown> = {}) {
  kit.state.pathname = pathname;
  return <VolunteerAdminShell {...props}>{<p>page body</p>}</VolunteerAdminShell>;
}

describe("the volunteer shell in English", () => {
  test("shows the brand, the skip link, the role and every page of the administrator's navigation", () => {
    kit.state.role = "admin";
    const markup = renderAdminInEnglish(shell("/admin/volunteers/people"));
    expectNoChineseText(markup, { allow: [TOGGLE_WORD] });
    for (const text of [
      "Skip to page content",
      "Volunteer operations",
      "Administrator workspace",
      "Volunteer workspace",
      "Daily work",
      "People",
      "Policy",
      "Workspace navigation · Volunteer directory",
      "Breadcrumb",
    ]) {
      expect(markup, text).toContain(text);
    }
    for (const page of VOLUNTEER_WORKSPACE_PAGES) {
      expect(markup, page.id).toContain(kit.html(volunteerWorkspaceCopy.en.pages[page.id].label));
    }
  });

  test("shows staff the daily operations only, in the staff workspace", () => {
    kit.state.role = "staff";
    const markup = renderAdminInEnglish(shell("/admin/volunteers"));
    expectNoChineseText(markup, { allow: [TOGGLE_WORD] });
    expect(markup).toContain("Staff workspace");
    expect(markup).toContain("Daily work");
    expect(markup).toContain("People");
    expect(markup).not.toContain(">Policy<");
    expect(markup).not.toContain("Session policy");
    kit.state.role = "admin";
  });

  test("draws one breadcrumb, the layout's, and ends it at the page that opens a detail page", () => {
    kit.state.role = "admin";
    const person = renderAdminInEnglish(shell("/admin/volunteers/people/abc"));
    expectNoChineseText(person, { allow: [TOGGLE_WORD] });
    // The record has not loaded, so the trail stops at the directory instead of naming a person.
    expect(person.match(/aria-label="Breadcrumb"/g)).toHaveLength(1);
    expect(person).toContain('<span class="break-words">Volunteer directory</span>');
    const registration = renderAdminInEnglish(shell("/admin/volunteers/registrations/xyz"));
    expectNoChineseText(registration, { allow: [TOGGLE_WORD] });
    expect(registration.match(/aria-label="Breadcrumb"/g)).toHaveLength(1);
    expect(registration).toContain('<span class="break-words">Activities and registrations</span>');
  });

  test("gives the shell's pages one h1 at most: the shell writes it only when the page asks", () => {
    kit.state.role = "admin";
    const plain = renderAdminInEnglish(shell("/admin/volunteers/tasks"));
    expect(plain).not.toContain("<h1");
    const asked = renderAdminInEnglish(shell("/admin/volunteers/people", { intro: "people" }));
    expect(asked.match(/<h1/g)).toHaveLength(1);
  });

  test("writes the heading and the line of the directory and the person page itself", () => {
    const people = renderAdminInEnglish(shell("/admin/volunteers/people", { intro: "people" }));
    expectNoChineseText(people, { allow: [TOGGLE_WORD] });
    expect(people).toContain("<h1>Volunteer directory</h1>");
    expect(people).toContain(
      "<p>Find volunteer profiles, verify qualifications and see registrations and service records.</p>",
    );
    const person = renderAdminInEnglish(shell("/admin/volunteers/people/abc", { intro: "person" }));
    expect(person).toContain("<h1>Volunteer details</h1>");
    expect(person).toContain(
      "<p>Handle volunteer service from the recorded profile, evidence and facts.</p>",
    );
  });

  test("shows a heading, a line and actions the page gives as they are", () => {
    const markup = renderAdminInEnglish(
      shell("/admin/volunteers/settings", {
        title: FIXTURE.activity,
        description: FIXTURE.note,
        actions: <button>Save</button>,
      }),
    );
    expectNoChineseText(markup, { allow: [TOGGLE_WORD, FIXTURE.activity, FIXTURE.note] });
    expect(markup).toContain(`<h1>${FIXTURE.activity}</h1>`);
    expect(markup).toContain(`<p>${FIXTURE.note}</p>`);
    expect(markup).toContain("<button>Save</button>");
  });

  test("has an English label and description for every page, and they differ from the Chinese", () => {
    for (const page of VOLUNTEER_WORKSPACE_PAGES) {
      const en = volunteerWorkspaceCopy.en.pages[page.id];
      const zh = volunteerWorkspaceCopy.zh.pages[page.id];
      expect(en.label.length, page.id).toBeGreaterThan(2);
      expect(en.description.endsWith("."), page.id).toBe(true);
      expect(en.label).not.toBe(zh.label);
    }
    expectNoChineseInCopy(volunteerWorkspaceCopy.en);
    expect(getVolunteerNavigation("admin")).toHaveLength(13);
  });

  test("keeps the Chinese shell as it was", () => {
    kit.state.role = "admin";
    const markup = renderAdminInChinese(shell("/admin/volunteers/people", { intro: "people" }));
    for (const text of [
      "跳至頁面內容",
      "義工營運中心",
      "管理員工作區",
      ">日常<",
      ">人員<",
      ">政策<",
      "工作區導覽 · 義工名冊",
      "導覽路徑",
      "<h1>義工名冊</h1>",
      "<p>查找義工身份、核實資格，並查看報名與服務紀錄。</p>",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(
      renderAdminInChinese(shell("/admin/volunteers/people/abc", { intro: "person" })),
    ).toContain("<h1>義工個人詳情</h1>");
    kit.state.role = "staff";
    expect(renderAdminInChinese(shell("/admin/volunteers"))).toContain("職員工作區");
    kit.state.role = "admin";
  });

  test("names the numbered links of a page in the language of the page", () => {
    const sections = [{ id: "a", label: "First" }];
    expect(renderAdminInEnglish(<WorkflowSections sections={sections} />)).toContain(
      'aria-label="Steps on this page"',
    );
    expect(renderAdminInChinese(<WorkflowSections sections={sections} />)).toContain(
      'aria-label="本頁步驟"',
    );
    expect(
      renderAdminInEnglish(<WorkflowSections sections={sections} label="Own label" />),
    ).toContain('aria-label="Own label"');
  });
});

const coverage = (state: string, extra: Record<string, unknown> = {}) => ({
  state,
  from: "2026-10-09",
  to: "2026-10-22",
  centre: "all",
  scheduledSlots: 10,
  publishedSlots: 7,
  unpublishedSlots: 2,
  missingSlots: 1,
  offDays: 3,
  inapplicableDays: 1,
  nextApprovedAt: "2026-10-12T02:00:00Z",
  blockers: [],
  ...extra,
});
const emptyCoverage = (state: string) =>
  coverage(state, {
    scheduledSlots: null,
    publishedSlots: null,
    unpublishedSlots: null,
    missingSlots: null,
    offDays: null,
    inapplicableDays: null,
    nextApprovedAt: null,
  });
const todaySession = (over: Record<string, unknown> = {}) => ({
  id: "session-1",
  title: FIXTURE.activity,
  starts_at: "2026-10-09T01:00:00Z",
  ends_at: "2026-10-09T04:00:00Z",
  location: FIXTURE.location,
  status: "published",
  policy: { id: "policy-1" },
  approved_participants: 6,
  capacity: 12,
  shortages: [] as { role: string; missing: number }[],
  ...over,
});
const blockers = [
  { date: "2026-10-10", templateKey: "t1", policyName: FIXTURE.template, reason: "missing" },
  { date: "2026-10-11", templateKey: "t2", policyName: FIXTURE.template, reason: "unpublished" },
  {
    date: "2026-10-12",
    templateKey: "t3",
    policyName: FIXTURE.template,
    reason: "policy_inapplicable",
  },
];
const FIXTURE_ALLOW = [FIXTURE.activity, FIXTURE.location, FIXTURE.role, FIXTURE.template];

describe("the volunteer overview in English", () => {
  const full = {
    "volunteer-overview": kit.ok({
      date: "2026-10-09",
      counts: { pendingProfiles: 3, pendingRegistrations: 5, todayActivities: 2 },
      coverage: {
        centres: ["cat", "dog", "adoption", "mystery_shelter"],
        next14: coverage("covered", { blockers }),
        next30: coverage("attention", { blockers: blockers.slice(0, 1), nextApprovedAt: null }),
      },
    }),
    "volunteer-calendar": kit.ok({
      activities: [
        todaySession({ shortages: [{ role: FIXTURE.role, missing: 2 }] }),
        todaySession({ id: "session-2", policy: null, ends_at: null }),
        todaySession({ id: "session-3" }),
        todaySession({ id: "session-4", status: "draft", title: "should not show" }),
      ],
      truncated: true,
    }),
  };

  test("shows the figures, the coverage, today's sessions and the links without Chinese", () => {
    kit.withQueries(full, () => {
      const markup = renderAdminInEnglish(<VolunteerOverview />);
      expectNoChineseText(markup, { allow: FIXTURE_ALLOW });
      for (const text of [
        "9 Oct 2026 (Fri) · Hong Kong time",
        ">Volunteer operations</h1>",
        "Find a volunteer",
        "Volunteers awaiting verification",
        "Registrations awaiting approval",
        "Sessions starting today",
        "Service coverage for the next 14 and 30 days",
        "Cat shelter",
        "Dog shelter",
        "Adoption day",
        "Other venue",
        "Next 14 days",
        "Next 30 days",
        "Published sessions are in place",
        "Some sessions need attention",
        "Scheduled sessions",
        "Unpublished or no policy linked",
        "Days without a policy",
        "Next published session: 12 Oct 2026 (Mon) 10:00",
        "No approved date for the next service yet.",
        "10 Oct 2026 (Sat) · " + FIXTURE.template + ": Session not created yet",
        "11 Oct 2026 (Sun) · " + FIXTURE.template + ": Not published yet",
        "12 Oct 2026 (Mon) · " + FIXTURE.template + ": Policy not linked or not applicable",
        "Today&#x27;s service schedule",
        "09:00–12:00",
        "09:00–To be confirmed",
        FIXTURE.role + " needs 2 more people",
        "6 confirmed · session capacity 12",
        "No policy is linked, so role shortfalls are not worked out.",
        "Minimum places for every role are met",
        "There is a lot of data, so only some records are shown here.",
        "Find every volunteer",
        "Follow up unfinished work",
      ]) {
        expect(markup, text).toContain(text);
      }
      expect(markup).not.toContain("should not show");
      expect(markup).not.toContain("Could not load");
      // A venue an admin added has no English name, so the stored key is not shown as a label.
      expect(markup).not.toContain(">mystery_shelter<");
      expect(markup).toContain('value="mystery_shelter">Other venue</option>');
    });
  });

  test("tells several venues without a name apart in the venue list, and keeps the key in Chinese", () => {
    const two = {
      ...full,
      "volunteer-overview": kit.ok({
        date: "2026-10-09",
        counts: { pendingProfiles: 3, pendingRegistrations: 5, todayActivities: 2 },
        coverage: {
          centres: ["cat", "mystery_a", "mystery_b"],
          next14: coverage("covered"),
          next30: coverage("covered"),
        },
      }),
    };
    kit.withQueries(two, () => {
      const markup = renderAdminInEnglish(<VolunteerOverview />);
      expect(markup).toContain(">Other venue 1</option>");
      expect(markup).toContain(">Other venue 2</option>");
      expect(markup).toContain(">Cat shelter</option>");
      expect(markup).not.toContain("mystery_a<");
      const zh = renderAdminInChinese(<VolunteerOverview />);
      expect(zh).toContain(">mystery_a</option>");
      expect(zh).toContain(">貓舍</option>");
      expect(zh).not.toContain("Other venue");
    });
  });

  test("says when a figure or the coverage could not be read, with a retry", () => {
    kit.withQueries(
      {
        "volunteer-overview": kit.ok({
          date: "2026-10-09",
          counts: { pendingProfiles: null, pendingRegistrations: 0, todayActivities: null },
          coverage: null,
        }),
        "volunteer-calendar": kit.failed(),
      },
      () => {
        const markup = renderAdminInEnglish(<VolunteerOverview />);
        expectNoChineseText(markup);
        expect(markup).toContain("Could not load this figure");
        expect(markup).toContain("Some figures could not be loaded. <button");
        expect(markup).toContain(">Retry figures</button>");
        expect(markup).toContain("Could not load today&#x27;s sessions.");
        expect(markup).toContain(">Reload</button>");
        expect(markup).toContain("Do not treat an unknown figure as zero sessions.");
        expect(markup).toContain("Refresh the page to try again.");
      },
    );
  });

  test("describes each state of the coverage, and shows nothing for a period it knows nothing about", () => {
    kit.withQueries(
      {
        "volunteer-overview": kit.ok({
          date: "2026-10-09",
          counts: { pendingProfiles: 1, pendingRegistrations: 1, todayActivities: 1 },
          coverage: {
            centres: [],
            next14: emptyCoverage("off_day"),
            next30: emptyCoverage("no_approved_policy"),
          },
        }),
        "volunteer-calendar": kit.ok({ activities: [] }),
      },
      () => {
        const markup = renderAdminInEnglish(<VolunteerOverview />);
        expectNoChineseText(markup);
        expect(markup).toContain("The selected dates are rest days or closed for service");
        expect(markup).toContain(
          "No approved policy, so the sessions that should open cannot be worked out",
        );
        expect(markup).not.toContain("Scheduled sessions");
        expect(markup).toContain("No published sessions today.");
        expect(markup).toContain("View activities and registrations");
      },
    );
    kit.withQueries(
      {
        "volunteer-overview": kit.ok({
          date: "2026-10-09",
          counts: { pendingProfiles: 1, pendingRegistrations: 1, todayActivities: 1 },
          coverage: {
            centres: [],
            next14: emptyCoverage("policy_inapplicable"),
            next30: emptyCoverage("unavailable"),
          },
        }),
        "volunteer-calendar": { isLoading: true },
      },
      () => {
        const markup = renderAdminInEnglish(<VolunteerOverview />);
        expect(markup).toContain("No policy applies on some dates");
        expect(markup).toContain("Coverage data is not available at the moment");
        expect(markup).toContain("Loading today&#x27;s sessions…");
      },
    );
    kit.withQueries({}, () => {
      const markup = renderAdminInEnglish(<VolunteerOverview />);
      expectNoChineseText(markup);
      expect(markup).toContain("Loading service coverage…");
    });
  });

  test("writes counts with thousands separators in English only", () => {
    const big = {
      "volunteer-overview": kit.ok({
        date: "2026-10-09",
        counts: { pendingProfiles: 12345, pendingRegistrations: 1, todayActivities: 1 },
        coverage: {
          centres: [],
          next14: coverage("covered", { scheduledSlots: 1234, publishedSlots: 1000 }),
          next30: coverage("covered"),
        },
      }),
      "volunteer-calendar": kit.ok({
        activities: [todaySession({ approved_participants: 1500, capacity: 2000 })],
      }),
    };
    kit.withQueries(big, () => {
      const english = renderAdminInEnglish(<VolunteerOverview />);
      for (const text of ["12,345", "1,234", "1,000", "1,500 confirmed · session capacity 2,000"]) {
        expect(english, text).toContain(text);
      }
      const chinese = renderAdminInChinese(<VolunteerOverview />);
      for (const text of [">12345<", ">1234<", ">1000<", "1500 人已確認 · 場次容量 2000"]) {
        expect(chinese, text).toContain(text);
      }
      expect(chinese).not.toContain("12,345");
    });
  });

  test("has English text for every state and blocker, and for each string in the copy", () => {
    expectNoChineseInCopy(volunteerOverviewCopy.en);
    for (const key of Object.keys(volunteerOverviewCopy.zh.states)) {
      expect(
        volunteerOverviewCopy.en.states[key as keyof typeof volunteerOverviewCopy.en.states],
      ).toBeTruthy();
    }
    expect(collectCopyStrings(volunteerOverviewCopy.en).length).toBeGreaterThan(40);
  });

  test("keeps the Chinese overview as it was", () => {
    kit.withQueries(full, () => {
      const markup = renderAdminInChinese(<VolunteerOverview />);
      for (const text of [
        "義工營運總覽",
        "待核實義工",
        "未來 14／30 日服務覆蓋",
        "已排妥已發布場次",
        "下一個已發布場次：",
        "2026年10月10日 (六) · " + FIXTURE.template + "：尚未建立場次",
        "今日服務安排",
        FIXTURE.role + " 尚欠 2 人",
        "6 人已確認 · 場次容量 12",
        "職務最低名額已達標",
        "2026年10月9日 (五) · 香港時間",
        "貓舍",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
  });
});
