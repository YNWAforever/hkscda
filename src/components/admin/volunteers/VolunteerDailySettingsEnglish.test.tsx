import { describe, expect, test } from "bun:test";

import { readFileSync } from "node:fs";

import { AdminApiError } from "../../../lib/admin/session";
import { policyReason } from "../../../lib/volunteers/policy/messages";
import type { PolicyDraft } from "../../../lib/volunteers/policy/schemas";
import type { DailySettingsInitial } from "./VolunteerDailySettings";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

// The mocks and the fixtures are in volunteerKit.test.support.tsx and policyKit.test.support.tsx; the
// second loads the first, and both must load before a screen does.
const policyKit = await import("./policyKit.test.support");
const { VolunteerDailySettings } = await import("./VolunteerDailySettings");
const { dailySettingsCopy } = await import("./dailySettingsCopy");

const { kit, POLICY_ALLOW, POLICY_TEXT, cleanDraft, registry, rawKeysIn } = policyKit;
const KEY = "dog:daily_newcomers";
const SELECTION = `${KEY}|2026-10-10`;

/** A policy with the daily limit the screen edits and a late release rule that relaxes it. */
function dailyPolicy(): PolicyDraft {
  return cleanDraft("dog-cleaning-b", (draft) => {
    draft.daily_limits = [
      {
        key: "daily_newcomers",
        tiers: ["newcomer", "regular"],
        maximum: { state: "value", value: 8 },
        scope: "shelter_day",
        count_mode: { state: "unresolved", reason: policyReason("daily_newcomer_counting") },
        include_group_visitors: true,
      },
    ];
    draft.release_rules = [
      {
        key: "daily_release_1",
        priority: 1,
        within_hours: 48,
        condition: {
          tiers: ["regular", "senior"],
          operator: "lt",
          threshold: { state: "unresolved", reason: policyReason("enter_experienced_threshold") },
        },
        action: {
          type: "relax_quota",
          quota: "daily_newcomers",
          new_maximum: 12,
          scope: "shelter_day",
          daily_anchor: { state: "unresolved", reason: policyReason("pick_first_or_last") },
        },
        allowed_tiers: ["newcomer"],
        credentials: { mode: "any", keys: ["socialisation_training"] },
        weekdays: [1, 3],
      },
      {
        key: "daily_release_2",
        priority: 2,
        semantics: "once",
        within_hours: 24,
        condition: { tiers: ["senior"], operator: "lte", threshold: 2 },
        action: {
          type: "relax_quota",
          quota: "daily_newcomers",
          new_maximum: 14,
          scope: "shelter_day",
          daily_anchor: "last_session",
        },
        allowed_tiers: ["newcomer"],
        credentials: { mode: "all", keys: [] },
        weekdays: "preserve",
      },
    ];
  });
}

function binding(scope: string, date: string, over: Record<string, unknown> = {}) {
  const policy = dailyPolicy();
  return {
    scope_key: scope,
    service_date: date,
    revision: 4,
    body: policy.daily_limits[0],
    release_rules: policy.release_rules,
    timezone: "Asia/Hong_Kong",
    policy_body: policy,
    activities: [
      { id: "activity-1", title: kit.FIXTURE.activity, starts_at: "2026-10-10T01:00:00Z" },
      { id: "activity-2", title: POLICY_TEXT.templates[0], starts_at: "2026-10-10T07:30:00Z" },
    ],
    ...over,
  };
}

const listing = {
  bindings: [
    binding(KEY, "2026-10-10"),
    binding("all:cap", "2026-10-11"),
    binding("adoption:day", "2026-10-12"),
    binding("venue-yuen-long:cap", "2026-10-13"),
  ],
  credentials: registry().credentials,
};

const preview = {
  preview_id: "preview-1",
  occupied: 1234,
  before: dailyPolicy().daily_limits[0],
  after: { ...dailyPolicy().daily_limits[0], maximum: { state: "value" as const, value: 12 } },
  activity_ids: ["activity-2"],
};

function screen(
  language: "en" | "zh",
  initial: DailySettingsInitial = {},
  data: Record<string, unknown> = { "volunteer-daily-settings": kit.ok(listing) },
) {
  let markup = "";
  kit.withQueries(data, () => {
    const element = (
      <VolunteerDailySettings
        initial={{ selection: SELECTION, draft: dailyPolicy(), dirty: true, ...initial }}
      />
    );
    markup = language === "en" ? renderAdminInEnglish(element) : renderAdminInChinese(element);
  });
  return markup;
}

describe("the daily volunteer quota in English", () => {
  test("shows the quota, its late release rule and the check before publishing", () => {
    const markup = screen("en", { preview });
    expectNoChineseText(markup, { allow: POLICY_ALLOW });
    for (const text of [
      ">Daily quota</h1>",
      "Sessions in the same scope and on the same date share one quota.",
      "Back to volunteer policy settings",
      'aria-label="Steps on this page"',
      ">Daily quota</a>",
      ">Late release</a>",
      ">Check before publishing</a>",
      "Choose a date and quota",
      "10 Oct 2026 (Sat) · Revision 4 (not published yet)",
      "The current daily maximum is 8. 2 sessions share this quota.",
      "Daily places mode",
      "Fixed number",
      "Daily places",
      "Counting method",
      "Undecided",
      "Count each person once a day",
      "Count each confirmed time slot once",
      "Tiers the quota applies to",
      "Count group visitor attendances (without a visitor profile they cannot be counted as different people)",
      "Daily late release",
      "This only relaxes the daily part.",
      "Release mode",
      "Not set yet",
      "Dynamic: recalculated",
      "One-off: not taken back after release",
      "Hours before the start",
      "Daily time basis",
      "First session of the day",
      "Last session of the day",
      "Threshold comparison",
      "Fewer than",
      "No more than",
      "Threshold of confirmed attendances",
      "Tiers counted towards the threshold",
      "Daily maximum after release",
      "Tiers that can receive places",
      "Qualification combination for release",
      "All selected qualifications",
      "Any selected qualification",
      "Qualifications required for release",
      "Weekday limit",
      "Keep the existing weekday limit",
      "Use the weekdays below",
      "Weekdays for release",
      "Mon",
      "Wed",
      "Remove this late release rule",
      "Add a daily late release rule",
      "Preview the effect on the whole day",
      "Discard unpublished changes",
      "Check before publishing",
      "Reason for publishing",
      "Confirm and publish the daily quota",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toContain(POLICY_TEXT.qualifications[0]);
  });

  test("names the scope of each quota in the list of dates, never its key", () => {
    const markup = screen("en");
    for (const option of [
      "10 Oct 2026 (Sat) · Dog shelter · Daily quota for Newcomer, Regular",
      "11 Oct 2026 (Sun) · All venues · Daily quota for Newcomer, Regular",
      "12 Oct 2026 (Mon) · Adoption day · Daily quota for Newcomer, Regular",
      "13 Oct 2026 (Tue) · Other venue · Daily quota for Newcomer, Regular",
    ]) {
      expect(markup, option).toContain(`>${option}</option>`);
    }
    for (const key of ["venue-yuen-long", "all:cap", "adoption:day"]) {
      expect(markup.replace(/ value="[^"]*"/g, ""), key).not.toContain(key);
    }
  });

  test("numbers the venues it has no name for, so two of them can be told apart", () => {
    const twoUnknown = {
      "volunteer-daily-settings": kit.ok({
        bindings: [
          binding(KEY, "2026-10-10"),
          binding("venue-yuen-long:cap", "2026-10-13"),
          binding("venue-tsuen-wan:cap", "2026-10-14"),
          // The same venue on another day keeps its number.
          binding("venue-yuen-long:cap", "2026-10-15"),
        ],
        credentials: registry().credentials,
      }),
    };
    const markup = screen("en", {}, twoUnknown);
    for (const option of [
      "10 Oct 2026 (Sat) · Dog shelter · Daily quota for Newcomer, Regular",
      "13 Oct 2026 (Tue) · Other venue 1 · Daily quota for Newcomer, Regular",
      "14 Oct 2026 (Wed) · Other venue 2 · Daily quota for Newcomer, Regular",
      "15 Oct 2026 (Thu) · Other venue 1 · Daily quota for Newcomer, Regular",
    ]) {
      expect(markup, option).toContain(`>${option}</option>`);
    }
    // Chinese shows each venue's key, as before, and the day in the shared format.
    const chinese = screen("zh", {}, twoUnknown);
    for (const option of [
      "2026年10月13日 (二) · venue-yuen-long · 新手／恆常每日配額",
      "2026年10月14日 (三) · venue-tsuen-wan · 新手／恆常每日配額",
      "2026年10月15日 (四) · venue-yuen-long · 新手／恆常每日配額",
    ]) {
      expect(chinese, option).toContain(`>${option}</option>`);
    }
    expect(dailySettingsCopy.en.scopeName("mystery:cap", { position: 2, total: 2 })).toBe(
      "Other venue 2",
    );
    expect(dailySettingsCopy.en.scopeName("cat:cap", { position: 0, total: 2 })).toBe(
      "Cat shelter",
    );
    expect(dailySettingsCopy.zh.scopeName("mystery:cap", { position: 2, total: 2 })).toBe(
      "mystery",
    );
  });

  test("agrees the verb with the number of sessions that share the quota", () => {
    const one = {
      "volunteer-daily-settings": kit.ok({
        bindings: [
          binding(KEY, "2026-10-10", {
            activities: [
              { id: "activity-1", title: kit.FIXTURE.activity, starts_at: "2026-10-10T01:00:00Z" },
            ],
          }),
        ],
        credentials: registry().credentials,
      }),
    };
    expect(screen("en", {}, one)).toContain(
      "The current daily maximum is 8. 1 session shares this quota.",
    );
    expect(screen("en")).toContain("The current daily maximum is 8. 2 sessions share this quota.");
    expect(dailySettingsCopy.en.current("Unlimited", 0)).toBe(
      "The current daily maximum is Unlimited. 0 sessions share this quota.",
    );
  });

  test("gives every line of the check before publishing its own React key", () => {
    // Two problems can name the same setting, and React cannot be asked about duplicate keys without a
    // DOM, so the key is pinned: the position in the list comes first.
    expect(
      readFileSync(new URL("./VolunteerDailySettings.tsx", import.meta.url), "utf8"),
    ).toContain("<li key={`${i}:${x.path}`}>{x.message}</li>");
  });

  test("says what is left to decide, in English and without a field path", () => {
    const markup = screen("en");
    for (const message of [
      "Late release needs a choice between dynamic and one-off release. Choose one.",
      "Daily late release needs the first or the last session as its time basis. Choose one.",
      "Choose whether daily newcomers are counted as different people or as attendances.",
      "Enter the threshold for too few experienced volunteers.",
      "Choose the first or the last session.",
      "The dog shelter group opening window is not set yet.",
    ]) {
      expect(markup, message).toContain(`<li>${message}</li>`);
    }
    expect(markup).toContain('<ul role="alert">');
    expect(rawKeysIn(markup, ["daily_newcomers", "daily_release_1", "daily_release_2"])).toEqual(
      [],
    );
  });

  test("writes the effect of publishing with the clock of the quota and thousands separators", () => {
    const markup = screen("en", { preview });
    expect(markup).toContain(
      "The daily places change from 8 to 12. 1,234 are counted so far, and the change applies to 1 session that day. The late release settings above also replace the settings for that day.",
    );
    // 07:30 UTC is 15:30 in Hong Kong, written on the 24-hour clock.
    expect(markup).toContain(`${POLICY_TEXT.templates[0]} · 15:30</li>`);
    expect(markup).not.toContain(`${kit.FIXTURE.activity} · 09:00</li>`);
    expect(markup).toContain('aria-label="Policy changes"');
    expect(markup).toContain("Maximum / Value");
    const unlimited = screen("en", {
      preview: {
        ...preview,
        before: { ...preview.before, maximum: { state: "unlimited" as const } },
        after: { ...preview.after, maximum: { state: "unresolved" as const, reason: "x" } },
        activity_ids: ["activity-1", "activity-2"],
      },
    });
    expect(unlimited).toContain("change from Unlimited to Undecided. 1,234 are counted so far");
    expect(unlimited).toContain("applies to 2 sessions that day");
  });

  test("tells what the screen last did", () => {
    expect(screen("en", { notice: "preview_updated" })).toContain(
      '<p role="status">The effect on the whole day is updated. Check it, then publish.</p>',
    );
    expect(screen("en", { notice: "published" })).toContain(
      "The daily quota is published. Every session on that day uses the same revision straight away.",
    );
    expect(screen("zh", { notice: "published" })).toContain(
      "全日配額已發布；同一天所有場次立即使用同一修訂。",
    );
  });

  test("says what to do when nothing can be chosen, while loading and after a failure", () => {
    const empty = screen(
      "en",
      { selection: "", draft: undefined, dirty: false },
      {
        "volunteer-daily-settings": kit.ok({ bindings: [], credentials: [] }),
      },
    );
    expect(empty).toContain(
      "No sessions with a daily quota have been created yet. Publish a policy and create sessions in the volunteer policy settings first.",
    );
    expect(screen("en", { selection: "", draft: undefined, dirty: false }, {})).toContain(
      "Loading the daily settings…",
    );
    const refused = new AdminApiError({
      status: 409,
      message: "資料已被更新，請重新整理及預覽後再試。",
    });
    const failed = screen(
      "en",
      { selection: "", draft: undefined, dirty: false },
      {
        "volunteer-daily-settings": kit.failed(refused),
      },
    );
    expect(failed).toContain(
      ">The data has been updated. Refresh the page, preview again and try again.</p>",
    );
    expect(failed).toMatch(/<button[^>]*>Retry<\/button>/);
    expectNoChineseText(failed);
    kit.withMutationError({ nothing: "to say" }, () => {
      expect(screen("en")).toContain("Could not process the settings. Try again.");
      expect(screen("zh")).toContain("未能處理設定，請重試。");
    });
    kit.withMutationError(new Error("Failed to fetch"), () => {
      expect(screen("en")).toContain("Failed to fetch");
    });
  });

  test("has English copy with no Chinese", () => {
    expectNoChineseInCopy(dailySettingsCopy.en);
    expect(dailySettingsCopy.en.limit("value", 1200)).toBe("1,200");
    expect(dailySettingsCopy.en.limit("unlimited", undefined)).toBe("Unlimited");
    expect(dailySettingsCopy.en.limit("unresolved", undefined)).toBe("Undecided");
    expect(dailySettingsCopy.en.scopeName("cat:cap")).toBe("Cat shelter");
    expect(dailySettingsCopy.en.scopeName("all:cap")).toBe("All venues");
    expect(dailySettingsCopy.en.scopeName("mystery:cap")).toBe("Other venue");
    expect(dailySettingsCopy.en.heading("10 Oct 2026 (Sat)", 1234, false)).toBe(
      "10 Oct 2026 (Sat) · Revision 1,234",
    );
  });
});

describe("the daily volunteer quota in Chinese", () => {
  test("names a scope as its venue, and every other word stays as it was", () => {
    const markup = screen("zh", { preview });
    for (const text of [
      "全日義工配額",
      "同一範圍及日期的場次共用同一配額。先預覽全日名單影響，再發布；不會自動取消已有報名。",
      "返回義工政策設定",
      'aria-label="本頁步驟"',
      "選擇日期及配額",
      "請選擇",
      "2026年10月10日 (六) · 狗舍 · 新手／恆常每日配額",
      "2026年10月11日 (日) · 跨場地 · 新手／恆常每日配額",
      // A scope is named as its venue is, and a venue the screen has no name for shows its key.
      "2026年10月12日 (一) · 領養日 · 新手／恆常每日配額",
      "2026年10月13日 (二) · venue-yuen-long · 新手／恆常每日配額",
      "2026年10月10日 (六) · 修訂 4（尚未發布）",
      "目前每日上限：8。共有 2 場受同一配額影響。",
      "每日名額模式",
      "指定數量",
      "無上限",
      "同一人全日計一次",
      "每個確認時段計一次",
      "受配額限制的級別",
      "計入團體訪客人次（未有訪客身份時不可按不同人計數）",
      "每日晚期補位",
      "只放寬每日分項；各場總容量、必要資格及報名截止仍然適用。門檻按同一範圍全日已確認人次計算。",
      "動態重新計算",
      "一次釋放後不收回",
      "當日首場",
      "當日末場",
      "已確認人次門檻",
      "補位後每日上限",
      "補位資格組合",
      "全部所選資格",
      "任何所選資格",
      "必要補位資格",
      "保留原有星期限制",
      "按以下補位星期",
      "週一",
      "移除此補位規則",
      "新增每日補位規則",
      "預覽全日影響",
      "放棄未發布變更",
      "發布前核對",
      "每日名額由 8 改為 12；目前已計 1234，適用全日 1 場。以上補位設定亦會取代當日版本。",
      `${POLICY_TEXT.templates[0]} · ${new Date("2026-10-10T07:30:00Z").toLocaleTimeString("zh-HK", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit" })}`,
      "發布原因",
      "確認發布全日配額",
      // The list of what is left to decide shows the stored reason, as it was stored.
      "<li>每日新手按不同人或人次計算</li>",
      "<li>請填寫熟手不足門檻</li>",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  // The screen used to call every scope that was not `all:` or `dog:` the cat shelter. That was a bug:
  // a venue other than the two shelters was named after the wrong one.
  test("names the scope of a quota after its venue", () => {
    const scopeName = dailySettingsCopy.zh.scopeName;
    expect(scopeName("all:cap")).toBe("跨場地");
    expect(scopeName("dog:cap")).toBe("狗舍");
    expect(scopeName("cat:cap")).toBe("貓舍");
    expect(scopeName("adoption:day")).toBe("領養日");
    expect(scopeName("venue-yuen-long:cap")).toBe("venue-yuen-long");
  });
});
