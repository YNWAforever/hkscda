import { describe, expect, test } from "bun:test";

import {
  collectCopyStrings,
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

// The mocks and the fixtures are in volunteerKit.test.support.tsx and policyKit.test.support.tsx; the
// second loads the first, and both must load before a screen does.
const policyKit = await import("./policyKit.test.support");
const { PolicyAdvancedFields } = await import("./PolicyAdvancedFields");
const { initialPolicyCatalogue } = await import("../../../lib/volunteers/policy/catalogue");
const { policyAdvancedCopy } = await import("./policyAdvancedCopy");
const { policyCommonCopy } = await import("./policyCommonCopy");

const { kit, POLICY_ALLOW, richDraft, registry, rawKeysIn, cleanDraft, savedDrafts } = policyKit;
const noop = () => {};
/** Identifiers that staff typed into the "Identifier" field of a quota or a limit. They are data. */
const IDENTIFIERS = [
  "mid_week",
  "daily_newcomers",
  "all_venues_cap",
  "release_leader",
  "relax_daily",
];

function english(policy = richDraft()) {
  let markup = "";
  kit.withQueries({ "volunteer-policy-sources": kit.ok(registry()) }, () => {
    markup = renderAdminInEnglish(<PolicyAdvancedFields policy={policy} onChange={noop} />);
  });
  return markup;
}

describe("the advanced policy fields in English", () => {
  test("show the places, the windows, the roles, the quotas, the limits and the late release rules", () => {
    const markup = english();
    expectNoChineseText(markup, { allow: POLICY_ALLOW });
    for (const text of [
      "Full places settings",
      "Volunteer places",
      "Visitor places",
      "Shared total places",
      "Groups count towards the shared total",
      "Group size mode",
      "Fixed range",
      "Group minimum",
      "Group maximum",
      "How leaders are counted",
      "Leader counted within the assistants",
      "Registration and cancellation windows",
      "Individual opening",
      "Group closing",
      "Cancellation closing",
      "Hours before the session",
      "Hong Kong calendar days before",
      "No restriction",
      "Group situation",
      "Published template to use when there is a group",
      "Published template to use when there is no group",
      "When a group is confirmed, the published version of this template for the session date is used.",
      "Group size freeze",
      "At group closing",
      "Late group change",
      "Revalidate",
      "Manual review",
      "Waitlist limit",
      "Auto-approve",
      "Allow waitlist",
      "Volunteer role places",
      "Add role",
      "Delete role",
      "Minimum people",
      "Reserved places",
      "Maximum people",
      "Allowed tiers",
      "Role qualifications",
      "All qualifications (AND)",
      "Any qualification (OR)",
      "Add a qualification name",
      "Tier quotas",
      "Add quota",
      "Weekdays it applies to",
      "Set the weekdays",
      "Delete quota",
      "Daily limits",
      "Add limit",
      "Whole day, same venue",
      "Whole day, all venues",
      "Counting method",
      "Different people",
      "Attendances",
      "Include group visitors",
      "Delete limit",
      "Late release rules",
      "Add rule",
      "Release mode",
      "Dynamic: recalculated when the condition changes",
      "One-off: once triggered, the release is not taken back",
      "Priority",
      "Threshold comparison",
      "Fewer than",
      "No more than",
      "Release reserved role places",
      "Relax a quota",
      "Role to release from",
      "Number to release",
      "Quota scope",
      "Whole day across venues",
      "Daily time basis (must be chosen)",
      "Start of the first session that day in the same scope",
      "Start of the last session that day in the same scope",
      "New maximum",
      "Tiers that can receive",
      "Delete rule",
      "Policy source",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("name the tiers and the weekdays in English", () => {
    const markup = english();
    for (const tier of ["Newcomer", "Regular", "Senior"]) expect(markup, tier).toContain(tier);
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(markup, day).toContain(` ${day}</label>`);
    }
    expect(markup).not.toContain("週");
  });

  test("name the open states of a setting and keep the stored reason out of the screen", () => {
    const markup = english();
    expect(markup).toContain(">Unlimited</option>");
    expect(markup).toContain(">Inherit</option>");
    expect(markup).toContain(">Undecided</option>");
    expect(markup).toContain(">Fixed number</option>");
    // The unresolved rule says why in English, and the Chinese reason stays in the policy.
    expect(markup).toContain(
      "<b>Unresolved: </b>48 hours before the session, with fewer than 5 seniors: the scope of cleaning A and B, the reserved pool, who can receive places and the newcomer maximum are not set yet. <button",
    );
    expect(markup).toContain(">Remove</button>");
  });

  test("name a quota in the list of quotas a rule can relax by its kind and the identifier staff typed", () => {
    const markup = english();
    for (const option of [
      "Tier quota: newcomers",
      "Tier quota: mid_week",
      "Daily limit: daily_newcomers",
      "Daily limit: all_venues_cap",
    ]) {
      expect(markup, option).toContain(`>${option}</option>`);
    }
  });

  test("show no stored key, code or field path as text", () => {
    expect(rawKeysIn(english(), IDENTIFIERS)).toEqual([]);
    const markup = english();
    for (const code of [
      "leader_in_assistants",
      "confirmed_group",
      "hours_before",
      "calendar_days_before",
      "all_shelters_day",
      "first_session",
      "release_reserved",
      "relax_quota",
    ]) {
      expect(markup.replace(/ value="[^"]*"/g, ""), code).not.toContain(code);
    }
  });

  test("show the qualifications and roles that staff named as they named them", () => {
    const markup = english();
    for (const name of [
      ...policyKit.POLICY_TEXT.qualifications,
      policyKit.POLICY_TEXT.guide,
      policyKit.POLICY_TEXT.driver,
    ]) {
      expect(markup, name).toContain(name);
    }
  });

  /** The settings screen passes what staff saved; the picker shows those names, which they can change. */
  function pickerWith(templates?: ReturnType<typeof cleanDraft>[]) {
    const policy = cleanDraft("cat-cleaning-a", (d) => (d.booking.scenario = "confirmed_group"));
    let markup = "";
    kit.withQueries({ "volunteer-policy-sources": kit.ok(registry()) }, () => {
      markup = renderAdminInEnglish(
        <PolicyAdvancedFields policy={policy} onChange={noop} templates={templates} />,
      );
    });
    return markup;
  }
  const saved = savedDrafts().map((draft) => draft.body);
  const nameOf = (key: string) => saved.find((draft) => draft.template_key === key)?.name ?? "";

  test("offer the saved templates for a group situation by the names staff saved", () => {
    const markup = pickerWith(saved);
    // Only saved names, which are data like any name staff typed, so no catalogue name can hide here.
    expectNoChineseText(markup, { allow: POLICY_ALLOW });
    expect(markup).toContain(`>${nameOf("cat-cleaning-a")}</option>`);
    expect(markup).toContain(`>${nameOf("cat-cleaning-b")}</option>`);
    // The other venues' templates and the other situations are not offered.
    expect(markup).not.toContain(`>${nameOf("dog-cleaning-a")}</option>`);
    expect(markup).not.toContain(`>${nameOf("cat-afternoon-chores")}</option>`);
  });

  test("offer a template under the name staff gave it when they renamed it", () => {
    const renamed = saved.map((draft) =>
      draft.template_key === "cat-cleaning-b"
        ? { ...draft, name: policyKit.POLICY_TEXT.driver }
        : draft,
    );
    const markup = pickerWith(renamed);
    expect(markup).toContain(`>${policyKit.POLICY_TEXT.driver}</option>`);
    expect(markup).not.toContain(`>${nameOf("cat-cleaning-b")}</option>`);
  });

  test("fall back to the catalogue names only where nothing is saved", () => {
    const markup = pickerWith();
    const catalogueName = (key: string) =>
      initialPolicyCatalogue.find((policy) => policy.template_key === key)?.name ?? "";
    for (const key of ["cat-cleaning-a", "cat-cleaning-b"]) {
      expect(markup, key).toContain(`>${catalogueName(key)}</option>`);
    }
    expectNoChineseText(markup, {
      allow: [...POLICY_ALLOW, catalogueName("cat-cleaning-a"), catalogueName("cat-cleaning-b")],
    });
  });

  test("have English copy that holds no Chinese and names every tier and weekday", () => {
    expectNoChineseInCopy(policyAdvancedCopy.en);
    expectNoChineseInCopy(policyCommonCopy.en);
    expect(collectCopyStrings(policyAdvancedCopy.en).length).toBeGreaterThan(100);
    expect(policyAdvancedCopy.en.newRole).toBe("New role");
    expect(policyCommonCopy.en.weekday(0)).toBe("Sun");
    expect(policyCommonCopy.en.weekday(6)).toBe("Sat");
    expect(policyAdvancedCopy.en.release.quotaOption("tier", "newcomers")).toBe(
      "Tier quota: newcomers",
    );
    expect(policyAdvancedCopy.en.release.quotaOption("daily", "cap")).toBe("Daily limit: cap");
  });

  test("keep the Chinese fields as they were", () => {
    let markup = "";
    kit.withQueries({ "volunteer-policy-sources": kit.ok(registry()) }, () => {
      markup = renderAdminInChinese(<PolicyAdvancedFields policy={richDraft()} onChange={noop} />);
    });
    for (const text of [
      "完整名額設定",
      "義工名額",
      "團體計入共用總數",
      "領隊計算方式",
      "領隊包括在助手",
      "報名及取消窗口",
      "個人開放",
      "取消截止",
      "香港日曆日前",
      "不限制",
      "團體情景",
      "有團體時採用的已發布模板",
      "團體名額凍結",
      "遲來團體變更",
      "容許候補",
      "職務名額",
      "新增職務",
      "刪除職務",
      "全部資格 AND",
      "任何資格 OR",
      "新增資格名稱",
      "級別配額",
      "適用星期",
      "解析星期設定",
      "每日限制",
      "同一舍全日",
      "所有場地全日",
      "不同人士",
      "出席人次",
      "遲段補位規則",
      "新增規則",
      "動態：條件改變即重新計算",
      "一次：觸發後不收回釋放",
      "釋放職務保留位",
      "放寬配額",
      "跨場地全日",
      "每日補位時間基準（須明選）",
      "同一範圍當日首場開始時間",
      "熟手門檻按同一範圍全日已確認人數計算；所有場次共用當日配額。",
      "刪除規則",
      "政策來源",
      "週日",
      "週六",
      "新手",
      "資深",
      // The unresolved rule shows the stored reason as it was stored, and a quota its identifier.
      "<b>未解析：</b>T−48h 資深不足5：清潔A/B適用範圍、釋放池、可接收者及新手上限待設定<button",
      ">daily_newcomers</option>",
      ">mid_week</option>",
    ]) {
      expect(markup, text).toContain(text);
    }
  });
});
