import { describe, expect, test } from "bun:test";

import { AdminApiError } from "../../../lib/admin/session";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

// The mocks and the fixtures are in volunteerKit.test.support.tsx and policyKit.test.support.tsx; the
// second loads the first, and both must load before a screen does.
const policyKit = await import("./policyKit.test.support");
const { VolunteerPolicySimulation } = await import("./VolunteerPolicySimulation");
const { VolunteerPolicySources } = await import("./VolunteerPolicySources");
const { policySimulationCopy } = await import("./policySimulationCopy");
const { policySourcesCopy } = await import("./policySourcesCopy");

const { kit, POLICY_ALLOW, POLICY_TEXT, registry } = policyKit;

/** The role the database lists for a draft with no roles of its own (it writes the label in Chinese). */
const DEFAULT_ROLE = "一般義工";

const simulationListing = {
  drafts: [
    {
      template_key: "cat-cleaning-a",
      name: POLICY_TEXT.templates[3],
      revision: 3,
      roles: [
        { key: "leader", label: POLICY_TEXT.guide },
        { key: "assistant", label: POLICY_TEXT.driver },
      ],
    },
    {
      template_key: "adoption-driver",
      name: POLICY_TEXT.templates[8],
      revision: 1234,
      roles: [{ key: "volunteer", label: DEFAULT_ROLE }],
    },
  ],
  profiles: [
    { id: "p1", name: POLICY_TEXT.volunteer, tier: "newcomer" },
    { id: "p2", name: POLICY_TEXT.volunteer, tier: "regular" },
    { id: "p3", name: POLICY_TEXT.volunteer, tier: "senior" },
    { id: "p4", name: POLICY_TEXT.volunteer, tier: "mystery_tier" },
  ],
  activities: [
    {
      id: "a1",
      title: kit.FIXTURE.activity,
      starts_at: "2026-10-10T01:00:00Z",
      template_key: "cat-cleaning-a",
    },
  ],
};

const evaluation = (over: Record<string, unknown> = {}) => ({
  simulation_only: true,
  evaluation: {
    allowed: false,
    reason: "capacity_full",
    capacity: 1500,
    confirmed: 1234,
    remaining: 0,
    next_boundary: "2026-10-11T04:30:00Z",
    ...over,
  },
});

function simulation(
  language: "en" | "zh",
  props: { template?: string } = {},
  data: Record<string, unknown> = { "volunteer-policy-simulation": kit.ok(simulationListing) },
) {
  let markup = "";
  kit.withQueries(data, () => {
    const element = <VolunteerPolicySimulation initial={props} />;
    markup = language === "en" ? renderAdminInEnglish(element) : renderAdminInChinese(element);
  });
  return markup;
}

describe("the policy simulation in English", () => {
  test("shows the form with a draft, a session, a volunteer, a role and a time", () => {
    const markup = simulation("en", { template: "cat-cleaning-a" });
    expectNoChineseText(markup, { allow: POLICY_ALLOW });
    for (const text of [
      "Policy simulation",
      "Choose a saved draft, an existing session, a verified volunteer and a Hong Kong time",
      "A simulation does not register anyone, publish, release one-off places or send notifications.",
      "Back to policy settings",
      'aria-label="Saved draft"',
      'aria-label="Session date"',
      'aria-label="Verified volunteer"',
      'aria-label="Volunteer role"',
      "Simulated Hong Kong time",
      "Run simulation",
      `${POLICY_TEXT.templates[3]} (draft revision 3)`,
      `${POLICY_TEXT.templates[8]} (draft revision 1,234)`,
      `10 Oct 2026 (Sat) 09:00 · ${kit.FIXTURE.activity}`,
      `${POLICY_TEXT.volunteer} (Newcomer)`,
      `${POLICY_TEXT.volunteer} (Regular)`,
      `${POLICY_TEXT.volunteer} (Senior)`,
      `${POLICY_TEXT.volunteer} (Unknown tier)`,
      `>${POLICY_TEXT.guide}</option>`,
      `>${POLICY_TEXT.driver}</option>`,
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("mystery_tier");
    expect(markup).toContain(">Choose</option>");
  });

  test("shows every role as it is named, including the one the database adds to a draft with none", () => {
    const markup = simulation("en", { template: "adoption-driver" });
    // The database writes this role's Chinese label itself, and a role that staff named the same is
    // stored in the same way, so the screen cannot tell the two apart. English shows both as data.
    expect(markup).toContain(`>${DEFAULT_ROLE}</option>`);
    expect(markup).not.toContain("General volunteer");
    expectNoChineseText(markup, { allow: [...POLICY_ALLOW, DEFAULT_ROLE] });
    expect(simulation("zh", { template: "adoption-driver" })).toContain(
      `>${DEFAULT_ROLE}</option>`,
    );
    expect(Object.keys(policySimulationCopy.en)).not.toContain("roleName");
  });

  test("tells the result of a simulation with its figures and the next rule boundary", () => {
    kit.withMutationData(evaluation(), () => {
      const markup = simulation("en", { template: "cat-cleaning-a" });
      expectNoChineseText(markup, { allow: POLICY_ALLOW });
      expect(markup).toContain("Simulation result: Does not meet the conditions");
      expect(markup).toContain("<p>The total capacity is full</p>");
      expect(markup).toContain("Effective capacity 1,500 · Confirmed 1,234 · Remaining 0");
      // 04:30 UTC is 12:30 in Hong Kong.
      expect(markup).toContain("Next rule boundary: 11 Oct 2026 (Sun) 12:30");
      expect(markup).toContain(
        "The result only holds for this simulated time and this data. A real registration is checked again.",
      );
    });
    kit.withMutationData(
      evaluation({
        allowed: true,
        reason: "available",
        capacity: undefined,
        confirmed: undefined,
        remaining: undefined,
        next_boundary: undefined,
      }),
      () => {
        const markup = simulation("en");
        expect(markup).toContain("Simulation result: Can register");
        expect(markup).toContain("Effective capacity — · Confirmed — · Remaining —");
        expect(markup).not.toContain("Next rule boundary");
      },
    );
  });

  test("gives every reason a simulation can end with an English text, and an unknown reason a fallback", () => {
    const reasons = [
      "available",
      "capacity_full",
      "role_full",
      "tier_quota_full",
      "daily_quota_full",
      "reserved_for_core_role",
      "credentials_required",
      "role_not_allowed",
      "tier_not_allowed",
      "tier_weekday_not_allowed",
      "date_closed",
      "activity_closed",
      "registration_not_open",
      "registration_closed",
      "group_scenario_mismatch",
      "daily_scope_requires_review",
      "minimum_age_not_met",
      "overlapping_duty",
    ];
    const seen = new Set<string>();
    for (const reason of reasons) {
      const text = policySimulationCopy.en.reason(reason);
      expectNoChineseText(text);
      expect(text, reason).not.toBe(policySimulationCopy.en.reason("never_heard_of_it"));
      expect(policySimulationCopy.zh.reason(reason), reason).not.toBe(
        policySimulationCopy.zh.reason("never_heard_of_it"),
      );
      expect(text).not.toContain("_");
      seen.add(text);
    }
    expect(seen.size).toBe(reasons.length);
    expect(policySimulationCopy.en.reason("never_heard_of_it")).toBe(
      "This draft's rules are not met. Check the session and the qualification settings.",
    );
    kit.withMutationData(evaluation({ reason: "never_heard_of_it" }), () => {
      expect(simulation("en")).toContain("This draft&#x27;s rules are not met.");
    });
  });

  test("shows its own message when a simulation or the list fails, never the server's text", () => {
    const refused = new AdminApiError({ status: 500, message: "未能完成模擬" });
    kit.withMutationError(refused, () => {
      const markup = simulation("en");
      expectNoChineseText(markup, { allow: POLICY_ALLOW });
      expect(markup).toContain(
        "Could not simulate. Complete every undecided setting in the draft, then reload the latest version.",
      );
      expect(simulation("zh")).toContain(
        "未能模擬：請先確認草稿所有待設定欄位，並重新載入最新版本。",
      );
    });
    const markup = simulation("en", {}, { "volunteer-policy-simulation": kit.failed(refused) });
    expect(markup).toContain("Could not load the simulation data. Reload the page and try again.");
    expectNoChineseText(markup);
    expect(simulation("zh", {}, { "volunteer-policy-simulation": kit.failed(refused) })).toContain(
      "未能載入模擬資料",
    );
  });

  test("keeps the Chinese form and results as they were", () => {
    kit.withMutationData(evaluation(), () => {
      const markup = simulation("zh", { template: "cat-cleaning-a" });
      for (const text of [
        "政策模擬",
        "選擇已儲存草稿、現有場次、已核實義工和香港時間，使用與報名相同的規則試算。模擬不會報名、發布、釋放一次名額或發送通知。",
        "返回政策設定",
        'aria-label="已儲存草稿"',
        "場次日期",
        "已核實義工",
        "模擬香港時間",
        "執行模擬",
        `${POLICY_TEXT.templates[3]}（草稿版本 3）`,
        `2026年10月10日 (六) 09:00 · ${kit.FIXTURE.activity}`,
        `${POLICY_TEXT.volunteer}（普通）`,
        `${POLICY_TEXT.volunteer}（資深）`,
        `${POLICY_TEXT.volunteer}（）`,
        "模擬結果：不符合條件",
        "總容量已滿",
        "有效容量 1500 · 已確認 1234 · 餘額 0",
        "下一規則邊界：",
        "結果只對本次模擬時間及資料有效，實際報名會重新檢查。",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
  });

  test("has English copy with no Chinese", () => {
    expectNoChineseInCopy(policySimulationCopy.en, { allow: [] });
  });
});

const sourcePreview = {
  preview_id: "preview-1",
  affected_templates: [
    { template_key: "cat-cleaning-a", name: POLICY_TEXT.templates[3] },
    { template_key: "cat-cleaning-b", name: POLICY_TEXT.templates[4] },
  ],
  effective_body: { name: POLICY_TEXT.templates[3], capacity: { volunteers: { value: 12345 } } },
};

function sources(language: "en" | "zh", kind?: "shelter" | "credential") {
  let markup = "";
  kit.withQueries({ "volunteer-policy-sources": kit.ok(registry()) }, () => {
    const element = <VolunteerPolicySources initial={{ kind }} />;
    markup = language === "en" ? renderAdminInEnglish(element) : renderAdminInChinese(element);
  });
  return markup;
}

describe("the shared sources, venues and qualifications in English", () => {
  test("shows the registry of venues and qualifications and the way to publish a source", () => {
    const markup = sources("en");
    expectNoChineseText(markup, { allow: POLICY_ALLOW });
    for (const text of [
      ">Venues and qualifications</h1>",
      ">Venues and qualifications</a>",
      ">Publish a source</a>",
      "Shared default → venue → template.",
      "Sessions that are already published keep their full earlier version.",
      "Back to template settings",
      "Manage venue and qualification names",
      'aria-label="Kind"',
      ">Service venue</option>",
      ">Qualification or skill</option>",
      'aria-label="Add or edit"',
      ">Add new</option>",
      "Display name",
      "Time zone",
      "Location",
      "Reason for the change",
      "Save the name and details",
      "Publish a shared or venue source",
      kit.html('with "Revert to inherited"'),
      'aria-label="Source level"',
      ">Shared default</option>",
      'aria-label="Use a saved draft"',
      ">Choose</option>",
      "Preview the source change",
    ]) {
      expect(markup, text).toContain(text);
    }
    // The registered names are data, shown as staff named them.
    expect(markup).toContain(`>${POLICY_TEXT.venues[0]}</option>`);
    expect(markup).toContain(`>${POLICY_TEXT.venues[1]}</option>`);
    expect(markup).toContain(`${POLICY_TEXT.templates[3]} (draft 3)`);
    expect(markup.replace(/ value="[^"]*"/g, "")).not.toContain("venue-yuen-long");
  });

  test("shows the qualification form without the time zone and the location", () => {
    const markup = sources("en", "credential");
    expect(markup).not.toContain("Time zone");
    expect(markup).toContain(`>${POLICY_TEXT.qualifications[0]}</option>`);
  });

  test("tells what a source change would do, and that nothing is published directly", () => {
    kit.withMutationData(sourcePreview, () => {
      const markup = sources("en");
      expectNoChineseText(markup, { allow: POLICY_ALLOW });
      for (const text of [
        `Source: ${POLICY_TEXT.templates[3]} · Volunteer capacity 12,345`,
        `Templates that use this source: ${POLICY_TEXT.templates[3]}, ${POLICY_TEXT.templates[4]}`,
        "Published sessions are not changed directly. Each template has to be previewed and published again before the change applies.",
        "Confirm and publish the source",
        '<p role="status">Saved.</p>',
        '<p role="status">Source published.</p>',
      ]) {
        expect(markup, text).toContain(text);
      }
    });
    kit.withMutationData(
      {
        ...sourcePreview,
        affected_templates: [],
        effective_body: { name: "x", capacity: { volunteers: {} } },
      },
      () => {
        const markup = sources("en");
        expect(markup).toContain("Templates that use this source: none at the moment");
        expect(markup).toContain("Volunteer capacity not a fixed number");
      },
    );
  });

  test("shows its own message when a call fails, never the server's text", () => {
    for (const text of [
      "請核對設定欄位",
      "設定未符合權限或有效性要求",
      "未能儲存來源設定",
      "無效要求",
    ]) {
      kit.withMutationError(new AdminApiError({ status: 400, message: text }), () => {
        const markup = sources("en");
        expectNoChineseText(markup, { allow: POLICY_ALLOW });
        for (const own of [
          "Could not save. Check the details or reload the latest version, then try again.",
          "The draft is not complete or its version has changed. Go back to the template settings and check it.",
          "The source has changed or the preview has expired. Preview it again.",
        ]) {
          expect(markup, own).toContain(own);
        }
      });
    }
    kit.withQueries({ "volunteer-policy-sources": kit.failed() }, () => {
      const markup = renderAdminInEnglish(<VolunteerPolicySources />);
      expect(markup).toContain("Could not load the settings. Reload the page and try again.");
      expect(renderAdminInChinese(<VolunteerPolicySources />)).toContain("未能載入設定。");
    });
  });

  test("keeps the Chinese screen as it was", () => {
    kit.withMutationData(sourcePreview, () => {
      const markup = sources("zh");
      for (const text of [
        "共用來源、場地及資格",
        ">場地與資格</a>",
        ">來源發布</a>",
        "共用預設 → 場地 → 模板。來源變更只影響之後的政策預覽；已發布場次保留原有完整版本。",
        "返回模板設定",
        "管理場地及資格名稱",
        'aria-label="類別"',
        ">服務場地</option>",
        ">資格／技能</option>",
        ">新增</option>",
        "顯示名稱",
        "時區",
        "地點",
        "更改原因",
        "儲存名稱與資料",
        "發布共用或場地來源",
        "場地來源可用「回復繼承」引用共用設定",
        ">共用預設</option>",
        `${POLICY_TEXT.templates[3]}（草稿 3）`,
        "預覽來源變更",
        `來源：${POLICY_TEXT.templates[3]} · 義工容量 12345`,
        `引用此來源的模板：${POLICY_TEXT.templates[3]}、${POLICY_TEXT.templates[4]}`,
        "不會直接改動已發布場次；各模板須再預覽及發布才套用。",
        "確認發布來源",
        '<p role="status">已儲存。</p>',
        '<p role="status">來源已發布。</p>',
      ]) {
        expect(markup, text).toContain(text);
      }
    });
    kit.withMutationData({ ...sourcePreview, affected_templates: [] }, () => {
      expect(sources("zh")).toContain("引用此來源的模板：目前沒有");
    });
    kit.withMutationError(new Error("x"), () => {
      const markup = sources("zh");
      for (const text of [
        "未能儲存，請核對資料或重新載入版本。",
        "草稿未完整或版本已改變，請先返回模板設定核對。",
        "來源已變更或預覽過期，請重新預覽。",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
  });

  test("has English copy with no Chinese", () => {
    expectNoChineseInCopy(policySourcesCopy.en);
  });
});
