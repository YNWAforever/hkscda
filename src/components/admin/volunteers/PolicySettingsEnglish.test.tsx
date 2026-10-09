import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ZodError } from "zod";

import { AdminApiError } from "../../../lib/admin/session";
import { policyDraftSchema } from "../../../lib/volunteers/policy/schemas";
import type { PolicySettingsInitial } from "./VolunteerPolicySettings";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

// The mocks and the fixtures are in volunteerKit.test.support.tsx and policyKit.test.support.tsx; the
// second loads the first, and both must load before a screen does.
const policyKit = await import("./policyKit.test.support");
const { VolunteerPolicySettings } = await import("./VolunteerPolicySettings");
const { policySettingsCopy } = await import("./policySettingsCopy");
const { PolicyInputError, englishPolicyProblems, policyErrorMessage, policyNoticeText } =
  await import("./policySettingsLogic");

const {
  kit,
  POLICY_ALLOW,
  POLICY_TEXT,
  cleanDraft,
  richDraft,
  registry,
  savedDrafts,
  settingsList,
} = policyKit;
const ALLOW = POLICY_ALLOW;
/** Identifiers that staff typed into the "Identifier" field of a quota or a limit. They are data. */
const IDENTIFIERS = [
  "mid_week",
  "daily_newcomers",
  "all_venues_cap",
  "release_leader",
  "relax_daily",
];

function queries(over: Record<string, unknown> = {}) {
  const draft = richDraft();
  return {
    "volunteer-policy-sources": kit.ok(registry()),
    "volunteer-policy-settings": kit.ok(settingsList()),
    "volunteer-policy-effective": kit.ok({ body: draft, provenance: { schedule: "shelter" } }),
    ...over,
  };
}

function screen(
  language: "en" | "zh",
  initial: PolicySettingsInitial = {},
  over: Record<string, unknown> = {},
) {
  let markup = "";
  kit.withQueries(queries(over), () => {
    const element = (
      <VolunteerPolicySettings initial={{ draft: richDraft(), revision: 3, ...initial }} />
    );
    markup = language === "en" ? renderAdminInEnglish(element) : renderAdminInChinese(element);
  });
  return markup;
}

/** The screen in English, started from `initial`. */
const english = (initial: PolicySettingsInitial = {}, over: Record<string, unknown> = {}) =>
  screen("en", initial, over);
const chinese = (initial: PolicySettingsInitial = {}, over: Record<string, unknown> = {}) =>
  screen("zh", initial, over);

describe("the volunteer policy settings in English", () => {
  test("show the screen with its headings, fields, advanced rules and sources", () => {
    const markup = english({ dirty: true });
    expectNoChineseText(markup, { allow: ALLOW });
    for (const text of [
      "Volunteer policy settings",
      "Shared sources, venues and qualifications",
      "Create a template (copy the current settings)",
      "Policy simulation",
      "Manage daily quotas and late release",
      "Save the draft first, then preview the affected activities. Revision 3 (not saved yet)",
      'aria-label="Steps on this page"',
      "Basic schedule and eligibility",
      "Places and registration rules",
      ">Sources</a>",
      "Preview and publish",
      "Policy template",
      'aria-label="Policy template"',
      'aria-label="Venue"',
      "Start time",
      "End time",
      "Location",
      "Volunteer places",
      "Minimum age",
      "Note title",
      "Note hint",
      "Required qualification identifiers (one per line)",
      "Tiers",
      "Newcomer",
      "Advanced rules: 3 roles, 2 tier quotas, 2 daily limits and 3 late release rules. These rules are kept. Unresolved items are listed below.",
      // The advanced fields and the table of sources are on the same screen.
      "Full places settings",
      "Late release rules",
      "Source of each setting and reverting to inherited",
      "Monthly tier assessment",
      "Assessment thresholds and notification arrangements are managed as separate versions.",
      "Manage the monthly tier assessment",
      "Publishing readiness",
      "Save draft",
      "Effective date",
      "End date (optional)",
      "Reason for publishing",
      "Affected activities",
      "Create preview",
      "Publish policy",
      "Duplicate a published version",
      "Create activity",
      'aria-label="Date for the new activity"',
      "Create the activity for this date",
      "You have unsaved changes. Save before leaving the page.",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("name a venue by its registered name and the three built-in venues by their English names", () => {
    const markup = english();
    expect(markup).toContain(`>${POLICY_TEXT.venues[0]}</option>`);
    expect(markup).toContain(`>${POLICY_TEXT.venues[1]}</option>`);
    let fallback = "";
    kit.withQueries(queries({ "volunteer-policy-sources": {} }), () => {
      fallback = renderAdminInEnglish(
        <VolunteerPolicySettings initial={{ draft: richDraft(), revision: 3 }} />,
      );
    });
    for (const name of ["Cat shelter", "Dog shelter", "Adoption day"]) {
      expect(fallback, name).toContain(`>${name}</option>`);
    }
  });

  test("name each unresolved setting by its place in the policy, with the reason in English", () => {
    const markup = english();
    expect(markup).toContain(
      "<b>Schedule / Start time</b>: The cat shelter morning start time is not set yet.",
    );
    expect(markup).toContain(
      "<b>Capacity / Shared total places</b>: An inherited value has to be resolved. Preview the policy to resolve it.",
    );
    expect(markup).toContain(
      "<b>Late release / Item 3 / Release mode</b>: Late release needs a choice between dynamic and one-off release. Choose one.",
    );
    expect(markup).toContain(
      "<b>Tier quotas / Item 2 / Service weekdays</b>: Waiting for an administrator to set it.",
    );
    expect(markup).toContain(
      "<b>Daily limits / Item 2 / Maximum</b>: Waiting for an administrator to set it.",
    );
    expect(markup).not.toContain("<b>schedule.start_time</b>");
    expect(markup).not.toContain("release_rules.2");
  });

  test("say there is nothing to resolve when the draft is ready", () => {
    const ready = richDraft();
    ready.release_rules = [];
    ready.schedule.start_time = "09:00";
    ready.schedule.end_time = "12:00";
    ready.capacity.shared_total = { state: "unlimited" };
    ready.capacity.group_in_shared_total = true;
    ready.tier_quotas = [];
    ready.daily_limits = [];
    ready.booking.cancellation_close = { mode: "unrestricted" };
    ready.booking.group_freeze = "at_group_close";
    expect(english({ draft: ready })).toContain("No settings are unresolved.");
    expect(chinese({ draft: ready })).toContain("沒有未解析設定。");
  });

  test("write the activities, the versions and the note about more sessions in English", () => {
    const markup = english({ activityIds: ["activity-1"] });
    expect(markup).toContain("Places 12 · Approved 4 · Waitlisted 1");
    expect(markup).toContain("Places 1,234 · Approved 1,200 · Waitlisted 3");
    expect(markup).toContain('checked=""');
    expect(markup).toContain("1 Oct 2026 (Thu) · Duplicate");
    expect(markup).toContain(
      'The policy preview shows the 500 nearest future sessions. You can look up all sessions by date and rebind them in the <a href="/admin/volunteers/activities" class="underline">activity workspace</a>.',
    );
  });

  test("show a preview with its changes, its sessions and each conflict named", () => {
    const preview = policyKit.policyPreview();
    const markup = english({ preview });
    expectNoChineseText(markup, { allow: ALLOW });
    expect(markup).toContain(`Preview: ${POLICY_TEXT.templates[0]} → ${POLICY_TEXT.templates[1]}`);
    expect(markup).toContain('aria-label="Policy changes"');
    expect(markup).toContain("Eligibility / Course qualifications / Qualifications");
    expect(markup).toContain(`${POLICY_TEXT.qualifications[0]}; Unnamed qualification`);
    expect(markup).toContain(`${kit.FIXTURE.activity} · Places 1,200</p>`);
    expect(markup).toContain(
      `${kit.FIXTURE.activity} · Places 3 · Conflicts: the session has already started, the capacity is below the approved places, other conflict</p>`,
    );
    expect(markup).not.toContain("mystery_conflict");
    expect(markup).not.toContain("historical_session");
    expect(markup).not.toContain("unlisted_key");
  });

  test("say so when a policy has no earlier published version to compare with", () => {
    const first = policyKit.policyPreview({ previous: null });
    expect(english({ preview: first })).toContain(
      `Preview: No earlier version → ${POLICY_TEXT.templates[1]}`,
    );
    expect(chinese({ preview: first })).toContain(`預覽：沒有舊版本 → ${POLICY_TEXT.templates[1]}`);
  });

  test("name the templates a group situation pairs with, in the picker and in the comparison, as staff saved them", () => {
    const pairing =
      (withGroup: string, withoutGroup: string) => (draft: ReturnType<typeof cleanDraft>) => {
        draft.booking.scenario = "confirmed_group";
        draft.booking.scenario_templates = { with_group: withGroup, without_group: withoutGroup };
      };
    const draft = cleanDraft("cat-cleaning-a", pairing("cat-cleaning-a", "cat-cleaning-b"));
    const preview = policyKit.policyPreview({
      previous: cleanDraft("cat-cleaning-a", pairing("cat-cleaning-a", "template-removed")),
      candidate: cleanDraft("cat-cleaning-a", pairing("cat-cleaning-a", "cat-cleaning-b")),
    });
    const markup = english({ draft, preview });
    const names = Object.fromEntries(
      savedDrafts().map((saved) => [saved.template_key, saved.body.name]),
    );
    // Only names that staff saved: a built-in name of the catalogue would be Chinese that is not in the allowance.
    expectNoChineseText(markup, { allow: ALLOW });
    expect(markup).toContain(`>${names["cat-cleaning-a"]}</option>`);
    expect(markup).toContain(`>${names["cat-cleaning-b"]}</option>`);
    // The comparison writes the name of each template, and "Other template" for one that is not saved.
    expect(markup).toContain("Other template");
    expect(markup).not.toContain("template-removed");
    expect(policyKit.rawKeysIn(markup, IDENTIFIERS)).toEqual([]);
  });

  test("give every line of the publishing readiness its own React key", () => {
    // Two problems can name the same setting, and React cannot be asked about duplicate keys without a
    // DOM, so the key is pinned: the position in the list comes first.
    expect(
      readFileSync(new URL("./VolunteerPolicySettings.tsx", import.meta.url), "utf8"),
    ).toContain("<li key={`${i}:${x.path}`}>");
  });

  test("describe a preview that found problems without showing a code or a path", () => {
    const preview = policyKit.policyPreview({
      issues: [
        { path: "capacity.volunteers", message: "啟用模板需要有限正數義工容量" },
        { path: "schedule.start_time", message: "T−48h unknown reason that was typed long ago" },
        { message: "級別不可重複" },
        "unresolved_settings",
        {},
      ],
    });
    const markup = english({ preview });
    expectNoChineseText(markup, { allow: ALLOW });
    for (const text of [
      "Capacity / Volunteer places: An enabled template needs a limited number of volunteer places above zero. Enter a number above zero.",
      "Schedule / Start time: This setting is not finished. Complete it.",
      "Each tier can only be chosen once. Remove the duplicate.",
      "This setting needs a change. Fix the draft and preview again.",
      "Fix this setting and preview again.",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("unresolved_settings");
    expect(markup).not.toContain("T−48h");
  });

  test("show no stored key, code or field path as text", () => {
    const markups = [english(), english({ preview: policyKit.policyPreview() })];
    for (const markup of markups) {
      // The one place a key shows is the field where staff type the qualification identifiers.
      const identifiers = markup.match(/<textarea[^>]*>socialisation_training<\/textarea>/);
      expect(identifiers).not.toBeNull();
      const withoutField = markup.replace(/<textarea[^>]*>socialisation_training<\/textarea>/, "");
      expect(policyKit.rawKeysIn(withoutField, IDENTIFIERS)).toEqual([]);
    }
  });
  test("write what the screen last did", () => {
    expect(english({ notice: { code: "draft_saved" } })).toContain(
      '<p role="status">Draft saved.</p>',
    );
    expect(english({ notice: { code: "published", count: 1 } })).toContain(
      '<p role="status">Published. 1 activity updated.</p>',
    );
    expect(english({ notice: { code: "published", count: 12 } })).toContain(
      "Published. 12 activities updated.",
    );
    expect(english({ notice: { code: "generated" } })).toContain(
      "The command to create the activity has finished.",
    );
    expect(chinese({ notice: { code: "published", count: 3 } })).toContain(
      "已發布，更新 3 個活動。",
    );
    expect(policyNoticeText({ code: "draft_saved" }, "zh")).toBe("草稿已儲存。");
    expect(policyNoticeText({ code: "generated" }, "zh")).toBe("活動建立指令已完成。");
  });

  test("say what to do when the policy cannot be read or is still loading", () => {
    let loading = "";
    kit.withQueries({}, () => {
      loading = renderAdminInEnglish(<VolunteerPolicySettings />);
    });
    expect(loading).toContain("Loading the volunteer policy…");
    let failed = "";
    kit.withQueries({ "volunteer-policy-settings": kit.failed() }, () => {
      failed = renderAdminInEnglish(<VolunteerPolicySettings />);
    });
    expect(failed).toContain(
      "Could not load the volunteer policy. Reload the page or try again later.",
    );
    expectNoChineseText(failed);
    kit.withQueries({}, () => {
      expect(renderAdminInChinese(<VolunteerPolicySettings />)).toContain("正在載入義工政策…");
    });
    kit.withQueries({ "volunteer-policy-settings": kit.failed() }, () => {
      expect(renderAdminInChinese(<VolunteerPolicySettings />)).toContain("未能載入義工政策。");
    });
  });
});

describe("the errors of the policy settings", () => {
  function withError(error: unknown, language: "en" | "zh") {
    let markup = "";
    kit.withMutationError(error, () => {
      markup = screen(language);
    });
    return markup;
  }

  test("tell the English admin what to do about a command that cannot run yet", () => {
    expect(withError(new PolicyInputError("save_and_date"), "en")).toContain(
      '<p role="alert" class="whitespace-pre-line text-[var(--color-error)]">Save the draft and choose an effective date first.</p>',
    );
    expect(withError(new PolicyInputError("preview_and_reason"), "en")).toContain(
      "Preview first and enter the reason for publishing.",
    );
    // The Chinese admin still gets the Chinese text, and the error's message is still Chinese.
    expect(withError(new PolicyInputError("save_and_date"), "zh")).toContain(
      "請先儲存草稿並選擇生效日期。",
    );
    expect(new PolicyInputError("preview_and_reason").message).toBe("請先預覽並填寫發布原因。");
  });

  test("name a conflict, a refusal from the server and an unknown failure in English", () => {
    const conflict = new AdminApiError({ status: 409, message: "資料已被更新" });
    expect(withError(conflict, "en")).toContain(
      "The draft was updated by another administrator. Reload the page and try again.",
    );
    expect(withError(conflict, "zh")).toContain("草稿已被其他管理員更新，請重新載入。");
    const refused = new AdminApiError({
      status: 422,
      message: "請檢查標示的設定欄位，修正後重新預覽。",
    });
    expect(withError(refused, "en")).toContain(
      "Check the highlighted settings, fix them and preview again.",
    );
    expect(withError(refused, "zh")).toContain("請檢查標示的設定欄位，修正後重新預覽。");
    const markup = withError(new Error("Failed to fetch"), "en");
    expect(markup).toContain("Failed to fetch");
    expect(withError({ nothing: "to say" }, "en")).toContain("The action failed. Try again.");
    expect(withError({ nothing: "to say" }, "zh")).toContain("操作失敗。");
    expectNoChineseText(withError(refused, "en"), { allow: ALLOW });
  });

  test("name the settings a draft that zod refused has wrong, never its JSON or its field paths", () => {
    const draft = richDraft();
    draft.eligibility.allowed_tiers = ["regular", "regular"];
    draft.schedule.start_time = "12:00";
    draft.schedule.end_time = "09:00";
    draft.schedule.generation_days = -1;
    draft.capacity.volunteers = { state: "value", value: 1 };
    const refused = policyDraftSchema.safeParse(draft).error as ZodError;
    const markup = withError(refused, "en");
    expectNoChineseText(markup, { allow: ALLOW });
    for (const line of [
      "Could not save. Fix these settings and save again:",
      "Eligibility / Allowed tiers: Each tier can only be chosen once. Remove the duplicate.",
      "Schedule / End time: The end time must be later than the start time. Change one of the times.",
      "Schedule / Days to create ahead: The value is too small. Increase it.",
    ]) {
      expect(markup, line).toContain(line);
    }
    expect(markup).not.toContain("&quot;code&quot;");
    expect(markup).not.toContain("eligibility.allowed_tiers");
    // The Chinese admin sees the text zod wrote, as before.
    expect(withError(refused, "zh")).toContain("&quot;code&quot;: &quot;custom&quot;");
    expect(policyErrorMessage(refused, "zh")).toBe(refused.message);
  });

  test("lists the first ten problems of a long list and counts the rest", () => {
    const many = new ZodError(
      Array.from({ length: 12 }, (_, i) => ({
        code: "custom" as const,
        path: ["roles", i, "key"],
        message: "識別碼不可重複",
      })),
    );
    const lines = englishPolicyProblems(many).split("\n");
    expect(lines).toHaveLength(12);
    expect(lines[0]).toBe("Could not save. Fix these settings and save again:");
    expect(lines[1]).toBe(
      "Volunteer role places / Item 1 / Identifier: Identifiers must all be different. Change the duplicate identifier.",
    );
    expect(lines[11]).toBe("2 more problems not shown.");
    expect(englishPolicyProblems(new ZodError(many.issues.slice(0, 11))).split("\n")[11]).toBe(
      "1 more problem not shown.",
    );
  });

  test("has English settings copy with no Chinese", () => {
    expectNoChineseInCopy(policySettingsCopy.en);
    expect(policySettingsCopy.en.errors.issueTexts.other).toBe("Check this value and try again.");
    expect(policySettingsCopy.en.copyName("Template")).toBe("Template (copy)");
    expect(policySettingsCopy.zh.copyName("模板")).toBe("模板（副本）");
  });
});

describe("the volunteer policy settings in Chinese", () => {
  test("stay as they were, with the raw paths and codes they have always shown", () => {
    const markup = chinese({ dirty: true, preview: policyKit.policyPreview() });
    for (const text of [
      "義工政策設定",
      "共用來源、場地及資格",
      "新增模板（複製目前設定）",
      "政策模擬",
      "管理全日配額及補位",
      "先儲存草稿，再預覽受影響活動。修訂 3（尚未儲存）",
      'aria-label="本頁步驟"',
      "基本時段與資格",
      "名額及報名規則",
      "預覽與發布",
      "政策模板",
      "開始時間",
      "結束時間",
      "義工名額",
      "最低年齡",
      "備註標題",
      "備註提示",
      "所需資格（每行一項）",
      "進階規則：職務 3、級別配額 2、每日限制 2、補位規則 3。這些規則會保留；未解析項目如下。",
      "每月級別評核",
      "管理每月級別評核",
      "發布準備狀態",
      // The list of what is still undecided shows the field path and the stored reason.
      "<b>schedule.start_time</b>：貓舍早上開始時間待設定",
      "<b>release_rules.2.semantics</b>：補位需要明選動態或一次釋放",
      "<b>capacity.shared_total</b>：需要解析繼承值",
      "儲存草稿",
      "生效日期",
      "結束日期（可留空）",
      "發布原因",
      "受影響活動",
      "名額 12 · 已批 4 · 候補 1",
      "建立預覽",
      "發布政策",
      `預覽：${POLICY_TEXT.templates[0]} → ${POLICY_TEXT.templates[1]}`,
      "· 衝突：historical_session、capacity_below_occupancy、mystery_conflict",
      '政策影響選取顯示最接近的 500 個未來場次；全部場次可在 <a href="/admin/volunteers/activities" class="underline">活動營運中心</a> 依日期查閱及重新綁定。',
      "複製已發布版本",
      `${new Date("2026-10-01T00:00:00Z").toLocaleDateString("zh-HK")} · 複製`,
      "建立活動",
      'aria-label="建立活動日期"',
      "建立當日活動",
      "尚有未儲存變更；離開頁面前請先儲存。",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(
      chinese({ preview: policyKit.policyPreview({ issues: [{ path: "a.b", message: "壞" }] }) }),
    ).toContain("a.b：壞");
  });
});
