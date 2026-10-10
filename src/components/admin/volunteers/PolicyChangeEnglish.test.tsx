import { describe, expect, test } from "bun:test";

import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

// The mocks and the fixtures are in volunteerKit.test.support.tsx and policyKit.test.support.tsx; the
// second loads the first, and both must load before a screen does.
const policyKit = await import("./policyKit.test.support");
const { PolicyChangeSummary } = await import("./PolicyChangeSummary");
const { PolicySourceFields } = await import("./PolicySourceFields");
const { policyChangeCopy, describeEnglishPolicyLeaf } = await import("./policyChangeCopy");
const { describePolicyValue } = await import("./policyChangeDisplay");
const { policySourceFieldsCopy } = await import("./policySourceFieldsCopy");
const { policyChanges } = await import("./policyChanges");
const { initialPolicyCatalogue } = await import("../../../lib/volunteers/policy/catalogue");
const { policySourcePaths } = await import("../../../lib/volunteers/policy/sourcePaths");

const {
  kit,
  POLICY_ALLOW,
  POLICY_TEXT,
  cleanDraft,
  policyPreview,
  richDraft,
  rawKeysIn,
  templateNames,
} = policyKit;
const noop = () => {};
const lookups = {
  shelters: { cat: POLICY_TEXT.venues[0] },
  credentials: { socialisation_training: POLICY_TEXT.qualifications[0] },
  templates: templateNames(),
};

describe("the comparison of two policy versions in English", () => {
  const preview = policyPreview();
  const changeCount = policyChanges(preview.previous, preview.candidate).length;
  const render = (element: React.ReactElement) => renderAdminInEnglish(element);

  test("names every change by its setting and writes its before and after in English", () => {
    const markup = render(
      <PolicyChangeSummary before={preview.previous} after={preview.candidate} lookups={lookups} />,
    );
    expectNoChineseText(markup, { allow: POLICY_ALLOW });
    expect(markup).toContain('aria-label="Policy changes"');
    for (const text of [
      `Changes · ${changeCount} items`,
      "Before",
      "This version",
      "Name",
      "Capacity / Volunteer places / Value",
      "Schedule / Service weekdays",
      "Sun; Mon; Tue; Wed; Thu; Fri; Sat",
      "Mon; Wed",
      "Registration windows / Session category",
      "Not applicable",
      "Confirmed group",
      "Registration windows / Group size freeze",
      "At group closing",
      "At session start",
      "Eligibility / Course qualifications / Qualifications",
      // A qualification that staff named shows its name, and one the list does not know is unnamed.
      `<dd class="break-words text-sm">${POLICY_TEXT.qualifications[0]}; Unnamed qualification</dd>`,
      "Schedule / Effective from",
      "Not set",
      "1 Oct 2026 (Thu)",
      "Notes / Required",
      "No",
      "Yes",
    ]) {
      expect(markup, text).toContain(text);
    }
    // A number has its thousands separators in English only, and a text staff typed stays as typed.
    expect(markup).toContain(POLICY_TEXT.templates[0]);
    expect(markup).toContain(POLICY_TEXT.templates[1]);
    expect(markup).toContain(POLICY_TEXT.locationTwo);
    expect(rawKeysIn(markup)).toEqual([]);
  });

  test("says when nothing differs, and counts one change as one item", () => {
    const same = render(<PolicyChangeSummary before={preview.previous} after={preview.previous} />);
    expect(same).toContain("Changes · 0 items");
    expect(same).toContain("<p>Same as the version compared.</p>");
    const one = render(
      <PolicyChangeSummary
        before={{ capacity: { visitors: { state: "value", value: 1200 } } }}
        after={{ capacity: { visitors: { state: "value", value: 1234 } } }}
      />,
    );
    expect(one).toContain("Changes · 1 item<");
    expect(one).toContain("1,200");
    expect(one).toContain("1,234");
  });

  test("never shows a stored code: a venue is its registered name, and an unknown value is 'Other value'", () => {
    const markup = render(
      <PolicyChangeSummary
        before={{ shelter: "cat", mystery_key: "mystery_value", timezone: "Asia/Hong_Kong" }}
        after={{ shelter: "venue-new", mystery_key: "other_mystery", timezone: "Europe/Paris" }}
        lookups={lookups}
      />,
    );
    expect(markup).toContain(`>${POLICY_TEXT.venues[0]}<`);
    expect(markup).toContain(">Other venue<");
    expect(markup).toContain(">Other setting<");
    expect(markup).toContain(">Other value<");
    expect(markup).toContain(">Hong Kong time<");
    expect(markup).toContain(">Europe/Paris<");
    expect(markup).not.toContain("mystery");
    expect(markup).not.toContain("venue-new");
  });

  test("names the templates a group situation pairs with and never shows their keys", () => {
    const markup = render(
      <PolicyChangeSummary
        before={{
          booking: {
            scenario_templates: { with_group: "dog-cleaning-a", without_group: "template-removed" },
          },
        }}
        after={{
          booking: {
            scenario_templates: {
              with_group: "cat-cleaning-a",
              without_group: "cat-afternoon-chores",
            },
          },
        }}
        lookups={lookups}
      />,
    );
    expectNoChineseText(markup, { allow: POLICY_ALLOW });
    for (const key of ["dog-cleaning-a", "cat-cleaning-a", "cat-afternoon-chores"]) {
      expect(markup, key).toContain(lookups.templates[key]);
      expect(markup, key).not.toContain(key);
    }
    // A template nobody saved is unnamed, and its key is not shown in its place.
    expect(markup).toContain(">Other template<");
    expect(markup).not.toContain("template-removed");
    expect(rawKeysIn(markup)).toEqual([]);
  });

  test("keeps the Chinese comparison of paired templates as the stored keys", () => {
    const markup = renderAdminInChinese(
      <PolicyChangeSummary
        before={{ booking: { scenario_templates: { with_group: "dog-cleaning-a" } } }}
        after={{ booking: { scenario_templates: { with_group: "cat-cleaning-a" } } }}
        lookups={lookups}
      />,
    );
    expect(markup).toContain("dog-cleaning-a");
    expect(markup).toContain("cat-cleaning-a");
    expect(markup).not.toContain("Other template");
  });

  test("describes values of every kind", () => {
    const en = policyChangeCopy.en;
    const say = (value: unknown, key = "") => describePolicyValue(value, en, lookups, key);
    expect(say(undefined)).toBe("Not set");
    expect(say(null)).toBe("Not set");
    expect(say(true)).toBe("Yes");
    expect(say(false)).toBe("No");
    expect(say([])).toBe("None");
    expect(say(["newcomer", "senior"], "tiers")).toBe("Newcomer; Senior");
    expect(say([0, 6], "weekdays")).toBe("Sun; Sat");
    expect(say({ mode: "hours_before", value: 24 })).toBe(
      "Method: Hours before the session · Value: 24",
    );
    expect(say({ state: "unresolved", reason: "待管理員設定" })).toBe(
      "Setting status: Undecided · Reason: Waiting for an administrator to set it.",
    );
    expect(say({ state: "unresolved", reason: "an old reason nobody knows" })).toContain(
      "This setting is not finished.",
    );
    // A template is its saved name, never its key; a template nobody saved is "Other template".
    expect(say({ with_group: "dog-cleaning-a" })).toBe(
      `With a group: ${lookups.templates["dog-cleaning-a"]}`,
    );
    expect(say({ without_group: "cat-cleaning-a" })).toBe(
      `Without a group: ${lookups.templates["cat-cleaning-a"]}`,
    );
    expect(say({ with_group: "template-deleted" })).toBe("With a group: Other template");
    expect(describeEnglishPolicyLeaf("dog-cleaning-a", "with_group", {})).toBe("Other template");
    expect(say("09:00", "start_time")).toBe("09:00");
    expect(say("2026-10-09", "excluded_dates")).toBe("9 Oct 2026 (Fri)");
    expect(say("3f6c1b6e-0000-4000-8000-000000000000", "version_id")).toBe(
      "A terms version is linked",
    );
    expect(say(1234567)).toBe("1,234,567");
    expect(describeEnglishPolicyLeaf("cat_shelter", "shelter", {})).toBe("Cat shelter");
  });

  test("keeps the Chinese comparison as it was, raw keys and values included", () => {
    const markup = renderAdminInChinese(
      <PolicyChangeSummary before={preview.previous} after={preview.candidate} />,
    );
    for (const text of [
      'aria-label="政策修改比較"',
      `修改比較 · ${changeCount} 項`,
      "原設定",
      "此版本",
      "容量 / volunteers / 數值",
      "時段 / 服務星期",
      "0；1；2；3；4；5；6",
      "1；3",
      "報名窗口 / 場次類別",
      "none",
      "confirmed_group",
      "at_group_close",
      "at_session_start",
      "沒有項目",
      "未設定",
      "是",
      "否",
    ]) {
      expect(markup, text).toContain(text);
    }
    const state = renderAdminInChinese(
      <PolicyChangeSummary
        before={{ capacity: { volunteers: { state: "unresolved", reason: "待設定" } } }}
        after={{ capacity: { volunteers: { state: "value", value: 5 } } }}
      />,
    );
    expect(state).toContain("設定狀態");
    expect(state).toContain("數值");
    expect(state).toContain(">5<");
    expect(state).toContain("unresolved");
    expect(
      renderAdminInChinese(
        <PolicyChangeSummary before={null} after={{ remarks: { enabled: true } }} />,
      ),
    ).toContain("啟用：是");
  });

  test("has English change copy with no Chinese", () => {
    expectNoChineseInCopy(policyChangeCopy.en);
    expect(policyChangeCopy.en.issuePath("release_rules.0.semantics")).toBe(
      "Late release / Item 1 / Release mode",
    );
    expect(policyChangeCopy.en.issuePath("something.new.1")).toBe(
      "Other setting / Other setting / Item 2",
    );
    expect(policyChangeCopy.zh.issuePath("release_rules.0.semantics")).toBe(
      "release_rules.0.semantics",
    );
    expect(policyChanges({ a: 1 }, { a: 2 })).toEqual([{ path: "a", before: 1, after: 2 }]);
  });
});

describe("the English names of the keys and values of a policy", () => {
  const catalogue = initialPolicyCatalogue.map((policy) => cleanDraft(policy.template_key));
  const drafts = [...catalogue, richDraft(), policyPreview().candidate];

  function keysOf(value: unknown, found = new Set<string>()): Set<string> {
    if (Array.isArray(value)) for (const item of value) keysOf(item, found);
    else if (value && typeof value === "object") {
      for (const [key, part] of Object.entries(value)) {
        found.add(key);
        keysOf(part, found);
      }
    }
    return found;
  }

  test("name every key a draft can hold, so no key is shown as it is stored", () => {
    const keys = new Set<string>();
    for (const draft of drafts) keysOf(draft, keys);
    expect(keys.size).toBeGreaterThan(80);
    for (const key of keys) {
      expect(policyChangeCopy.en.label(key), key).not.toBe("Other setting");
    }
    for (const path of policySourcePaths) {
      expect(policySourceFieldsCopy.en.settingName(path), path).not.toContain("Other setting");
    }
  });

  test("name every value of every draft, so no value is shown as a code", () => {
    for (const draft of drafts) {
      const text = describePolicyValue(draft, policyChangeCopy.en, lookups);
      expect(text).not.toContain("Other value");
      expect(text).not.toContain("Other setting");
    }
  });

  test("name the choices an undecided setting offers", () => {
    const text = describePolicyValue(
      { state: "unresolved", reason: "x", options: ["distinct_people", "168_hours"] },
      policyChangeCopy.en,
      lookups,
    );
    expect(text).toContain("Options: Different people; 168 hours");
  });
});

describe("the table of where each policy setting comes from, in English", () => {
  const effective = cleanDraft("cat-cleaning-a", (draft) => {
    draft.schedule.start_time = "09:00";
    draft.schedule.end_time = "12:00";
    draft.schedule.excluded_dates = ["2026-10-12"];
    draft.timezone = "Asia/Hong_Kong";
    draft.booking.scenario = "confirmed_group";
    draft.eligibility.valid_at = "session";
    draft.booking.group_freeze = "at_group_close";
    draft.terms.reconsent = "require_current";
  });
  const provenance = {
    schedule: "shelter",
    "schedule.start_time": "common",
    "schedule.end_time": "template",
    capacity: "inherited",
    timezone: "mystery",
  };
  const inherited = { ...richDraft(), inheritance: ["schedule.location" as const] };

  function render(language: "en" | "zh", error: unknown = null) {
    let markup = "";
    const answer = error ? { error, isError: true } : kit.ok({ body: effective, provenance });
    kit.withQueries({ "volunteer-policy-effective": answer }, () => {
      const element = <PolicySourceFields policy={inherited} onChange={noop} />;
      markup = language === "en" ? renderAdminInEnglish(element) : renderAdminInChinese(element);
    });
    return markup;
  }

  test("names each setting, where it comes from and its effective value", () => {
    const markup = render("en");
    expectNoChineseText(markup, { allow: POLICY_ALLOW });
    for (const text of [
      "Source of each setting and reverting to inherited",
      "Tick a box to use the venue source",
      "Manage shared and venue sources",
      "<th>Setting</th>",
      "<th>Source</th>",
      "<th>Effective value</th>",
      "<th>Revert to inherited</th>",
      "Dates and times · Start time",
      "Capacity · Group size",
      "Eligibility · Required skills",
      "Registration rules · Individual opening",
      "Registration rules · Paired policies",
      "Terms · Reconfirmation of terms",
      // Where a setting comes from.
      "<td>Venue</td>",
      "<td>Shared</td>",
      "<td>This template</td>",
      "<td>Inherited source</td>",
      // What it is worth.
      "<td>09:00</td>",
      "<td>12:00</td>",
      "<td>On the session date</td>",
      "<td>Hong Kong time</td>",
      "<td>At group closing</td>",
      "<td>The current terms must be agreed</td>",
      "<td>1 item</td>",
      "<td>Not set yet</td>",
      "<td>Set</td>",
      "<td>Not set</td>",
      "<td>Yes</td>",
    ]) {
      expect(markup, text).toContain(text);
    }
    // The sentence and the link to the sources have a space between them.
    expect(markup).toContain("separate choices. <a");
    // Every row has a name: no setting is called "Other setting".
    expect(markup).not.toContain("Other setting");
    expect(markup).toContain('aria-label="Inherit Dates and times, Location"');
    expect(markup).toContain('checked=""');
    expect(rawKeysIn(markup)).toEqual([]);
    // A source layer the server names in a way the screen does not know is this template's.
    expect(markup).not.toContain("mystery");
  });

  test("says the effective settings are updating, and that the draft is not complete", () => {
    const markup = render("en", new Error("boom"));
    expect(markup).toContain("Some fields are not complete. Complete the draft first.");
    expect(markup).toContain("<td>Not set</td>");
    expectNoChineseText(markup, { allow: POLICY_ALLOW });
  });

  test("writes the number of a fixed value with its thousands separator", () => {
    const wide = cleanDraft("cat-cleaning-a", (draft) => {
      draft.capacity.volunteers = { state: "value", value: 12345 };
      draft.capacity.visitors = { state: "unlimited" };
    });
    let markup = "";
    kit.withQueries(
      { "volunteer-policy-effective": kit.ok({ body: wide, provenance: {} }) },
      () => {
        markup = renderAdminInEnglish(<PolicySourceFields policy={wide} onChange={noop} />);
      },
    );
    expect(markup).toContain("<td>12,345</td>");
    expect(markup).toContain("<td>Unlimited</td>");
  });

  test("keeps the Chinese table as it was", () => {
    const markup = render("zh");
    for (const text of [
      "每項設定來源及回復繼承",
      "勾選即沿用場地來源，場地引用共用時再向上解析。取消勾選會將目前有效值複製為此模板覆寫；0、無上限及清除覆寫各自獨立。<a",
      "管理共用／場地來源",
      "<th>設定</th>",
      "<th>來源</th>",
      "<th>有效值</th>",
      "<th>回復繼承</th>",
      "時間及日期 · 開始時間",
      "容量 · 團體人數",
      "資格 · 所需技能",
      "預約規則 · 個人開放",
      "<td>場地</td>",
      "<td>共用</td>",
      "<td>此模板</td>",
      "<td>繼承來源</td>",
      "<td>09:00</td>",
      "<td>session</td>",
      "<td>1 項</td>",
      "<td>待設定</td>",
      "<td>已設定</td>",
      "<td>未設定</td>",
      "<td>是</td>",
      'aria-label="繼承 時間及日期 地點"',
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(render("zh", new Error("boom"))).toContain("部分欄位未完整，請先補齊草稿。");
  });

  test("has English copy with no Chinese", () => {
    expectNoChineseInCopy(policySourceFieldsCopy.en);
    expect(policySourceFieldsCopy.en.settingName("something.new")).toBe(
      "Other setting · Other setting",
    );
    expect(policySourceFieldsCopy.zh.settingName("something.new")).toBe("something · new");
  });
});
