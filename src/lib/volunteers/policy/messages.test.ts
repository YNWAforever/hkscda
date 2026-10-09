import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { expectNoChineseText, findChineseRuns } from "../../../components/admin/i18n/testing";
import {
  initialMonthlyPolicy,
  initialPolicyCatalogue,
  unresolvedSharedDailyLimit,
} from "./catalogue";
import { createDailyPolicyService } from "./dailyService";
import { policyJsonSchema } from "./jsonSchema";
import {
  localisePolicyMessage,
  localisePolicyReason,
  POLICY_REASON_CODES,
  POLICY_VALIDATION_CODES,
  policyReason,
  policyValidationCode,
  policyValidationMessage,
  type PolicyReasonCode,
  type PolicyValidationCode,
} from "./messages";
import { createPolicyService } from "./service";
import { sourceCommandSchema } from "./sourceService";
import {
  getPolicyReadiness,
  policyDraftSchema,
  policyReadySchema,
  type PolicyDraft,
} from "./schemas";
import { assessmentCommandSchema } from "../assessment/schemas";

/**
 * The zh-HK texts the policy validation has always produced, written out here so that a change to one of
 * them fails this test: the server sends them in the `issues` of its answers, and the Chinese admin reads
 * them through the readiness list.
 */
const ZH_VALIDATION: Record<PolicyValidationCode, string> = {
  tiers_duplicate: "級別不可重複",
  weekdays_duplicate: "星期不可重複",
  date_invalid: "日期無效",
  credentials_any_empty: "OR 資格不可留空",
  timezone_invalid: "IANA 時區無效",
  end_before_start: "結束時間必須晚於開始時間",
  effective_range_invalid: "生效日期範圍無效",
  keys_duplicate: "識別碼不可重複",
  window_order: "開放時間不可晚於截止時間",
  group_size_order: "團體最低人數不可高於上限",
  leader_model: "包含領隊模型需要足夠輔助名額涵蓋領隊",
  reserved_over_capacity: "保留位超出義工總容量",
  minimum_over_capacity: "最低職務人數超出義工總容量",
  role_over_maximum: "最低或保留位超出職務上限",
  priority_duplicate: "補位優先次序不可重複",
  release_pool_invalid: "釋放池不存在或釋放數超出保留位",
  release_pool_duplicate: "不可重複釋放同一保留池",
  quota_missing: "放寬配額或作用域不存在",
  inherit_unresolved: "需要解析繼承值",
  setting_incomplete: "未完成設定",
  capacity_finite: "啟用模板需要有限正數義工容量",
  release_semantics: "補位需要明選動態或一次釋放",
  release_anchor: "每日補位需要明選首場或末場作時間基準",
  inheritance_preview: "請預覽解析共用／場地來源後發布",
  template_mismatch: "模板識別不一致",
};

/** The reasons the catalogue and the admin store in an unresolved setting, as they have always been stored. */
const ZH_REASONS: Record<PolicyReasonCode, string> = {
  dog_group_open_window: "狗舍團體開放窗口待設定",
  dog_group_close_window: "狗舍團體截止窗口待設定",
  daily_newcomer_counting: "每日新手按不同人或人次計算",
  dog_late_release_pending:
    "T−48h 熟手不足門檻、晚期每日或單場配額作用域及星期限制待選；以 relax_quota 放寬新手至10，無需保留池",
  dog_group_window_unspecified: "狗舍團體窗口未指定",
  dog_group_close_unspecified: "狗舍團體截止未指定",
  dog_groups_in_total: "團體是否計入總數10",
  dog_group_size_range: "團體人數範圍待設定",
  experienced_places: "恆常／資深名額待選；5–6只是例子",
  cat_morning_start: "貓舍早上開始時間待設定",
  cat_morning_end: "貓舍早上結束時間待設定",
  cat_open_seven_days: "T−7須明選168小時或香港日曆日",
  cat_group_close_same_mode: "T−7團體截止須與個人開放採相同時間模式",
  cat_late_release_pending: "T−48h 資深不足5：清潔A/B適用範圍、釋放池、可接收者及新手上限待設定",
  cat_leader_counting: "領隊獨立或包含於輔助",
  cat_visit_open: "T−7開放：選擇168小時或香港日曆日",
  evening_open: "T−7或T−48開放待選",
  adoption_start: "指定開始時間待設定",
  adoption_end: "指定結束時間待設定",
  adoption_location: "指定場地待設定",
  adoption_weekdays: "指定服務日期待設定",
  adoption_places: "指定名額待設定",
  monthly_observation: "保持恆常觀察期間及計法待選",
  monthly_attendance_unit: "同日一次或每個核實非重疊時段一次",
  monthly_shelter_scope: "貓狗出席是否合計",
  monthly_promotion_trigger: "第N次核實後或月初評核",
  monthly_assessment_time: "香港時間執行時刻待設定",
  shared_daily_old_twenty: "舊全日20未經新版確認",
  shared_daily_scope: "適用場地及跨場地範圍",
  shared_daily_count_mode: "不同人或人次",
  shared_daily_group_visitors: "是否計團體訪客",
  pending_admin: "待管理員設定",
  pick_with_group_template: "請選擇有團體模板",
  pick_without_group_template: "請選擇無團體模板",
  pick_paired_template: "請選擇配對模板",
  pick_release_semantics: "請選擇釋放方式",
  pick_daily_anchor_pending: "待選全日首場或末場時間基準",
  pick_daily_anchor: "請選擇全日時間基準",
  enter_experienced_threshold: "請填寫熟手不足門檻",
  pick_first_or_last: "請選擇首場或末場",
};

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const base = (key = "cat-afternoon-chores") =>
  structuredClone(initialPolicyCatalogue.find((policy) => policy.template_key === key)!);

const messagesOf = (draft: unknown) => {
  const result = policyDraftSchema.safeParse(draft);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("the policy messages", () => {
  test("keep the zh-HK text of every validation code and every reason, and give each an English text", () => {
    expect([...POLICY_VALIDATION_CODES].map(String).sort()).toEqual(
      Object.keys(ZH_VALIDATION).sort(),
    );
    expect([...POLICY_REASON_CODES].map(String).sort()).toEqual(Object.keys(ZH_REASONS).sort());
    for (const code of POLICY_VALIDATION_CODES) {
      expect(policyValidationMessage(code), code).toBe(ZH_VALIDATION[code]);
      expect(policyValidationMessage(code, "zh"), code).toBe(ZH_VALIDATION[code]);
      expect(policyValidationCode(ZH_VALIDATION[code])).toBe(code);
      const english = policyValidationMessage(code, "en");
      expectNoChineseText(english);
      expect(english.endsWith("."), code).toBe(true);
      // Every message says what to do, in an imperative sentence.
      expect(english, code).toMatch(
        /(Remove|Enter|Choose|Change|Raise|Lower|Delete|Preview|Reload|Complete|Increase)/,
      );
      expect(findChineseRuns(ZH_VALIDATION[code]).length, code).toBeGreaterThan(0);
    }
    for (const code of POLICY_REASON_CODES) {
      expect(policyReason(code), code).toBe(ZH_REASONS[code]);
      const english = policyReason(code, "en");
      expectNoChineseText(english);
      expect(english.endsWith("."), code).toBe(true);
      expect(english, code).not.toMatch(/relax_quota|T−|T-/);
    }
    expect(new Set(POLICY_VALIDATION_CODES.map((code) => policyValidationMessage(code))).size).toBe(
      POLICY_VALIDATION_CODES.length,
    );
    expect(new Set(POLICY_REASON_CODES.map((code) => policyReason(code))).size).toBe(
      POLICY_REASON_CODES.length,
    );
  });

  test("find the English text of a stored message by its exact zh-HK text", () => {
    expect(localisePolicyMessage("級別不可重複", "zh")).toBe("級別不可重複");
    expect(localisePolicyMessage("級別不可重複", "en")).toBe(
      "Each tier can only be chosen once. Remove the duplicate.",
    );
    expect(localisePolicyMessage("a message nobody wrote", "en")).toBeNull();
    expect(policyValidationCode("a message nobody wrote")).toBeNull();
    expect(localisePolicyReason("待管理員設定", "zh")).toBe("待管理員設定");
    expect(localisePolicyReason("待管理員設定", "en")).toBe(
      "Waiting for an administrator to set it.",
    );
    // A stored sentence English has no text for is never shown in Chinese: it is an unfinished setting.
    expect(localisePolicyReason("一句從前寫下的話", "en")).toBe(
      "This setting is not finished. Complete it.",
    );
    expect(localisePolicyReason("一句從前寫下的話", "zh")).toBe("一句從前寫下的話");
  });

  test("cover every unresolved reason in the catalogue, the monthly policy and the shared daily limit", () => {
    const reasons = new Set<string>();
    const walk = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if ("state" in value && value.state === "unresolved" && "reason" in value) {
        reasons.add(String(value.reason));
      }
      for (const part of Object.values(value)) walk(part);
    };
    walk(initialPolicyCatalogue);
    walk(initialMonthlyPolicy);
    walk(unresolvedSharedDailyLimit);
    expect(reasons.size).toBeGreaterThan(25);
    const known = new Set(POLICY_REASON_CODES.map((code) => policyReason(code)));
    for (const reason of reasons) {
      expect(known.has(reason), reason).toBe(true);
      expectNoChineseText(localisePolicyReason(reason, "en"));
    }
  });
});

describe("the default output of the policy modules, which the server and the public pages read", () => {
  test("is byte for byte what it was before the English text was added", () => {
    // Hashes of the JSON of each export, taken before the messages moved into a table.
    expect(sha(initialPolicyCatalogue)).toBe(
      "6201c4281aa449a923a678882c347efda4ffd2ef23deccf6c0992b2090ce802f",
    );
    expect(sha(initialMonthlyPolicy)).toBe(
      "169debfa0970541e399246dff8d63059c8c8b6b4aff4a568c00b105ed0cb33ab",
    );
    expect(sha(unresolvedSharedDailyLimit)).toBe(
      "351c0efe6cc3ea1bfb218011616afad37865dd5c00f9142d5e695100510df249",
    );
    expect(sha(policyJsonSchema)).toBe(
      "041bbf202ce898a959becf0478f76bf5d1eeb18afa8779f7986773f08ae1cae4",
    );
    expect(sha(initialPolicyCatalogue.map((policy) => getPolicyReadiness(policy)))).toBe(
      "d37b542a58e11dd5a7285fe8243ff25071b1d5c1ff317fe7c04ded162da2f4b4",
    );
    expect(
      sha(
        initialPolicyCatalogue.map((policy) => {
          const result = policyReadySchema.safeParse(policy);
          return result.success ? null : result.error.issues;
        }),
      ),
    ).toBe("6aefafc47807ea6f2664cc98f5dcf9c09ad3abdbffc8047a2627aa2784e87d8d");
    const draft = base();
    draft.booking.individual_open = { mode: "hours_before", value: 1 };
    draft.booking.individual_close = { mode: "hours_before", value: 5 };
    expect(sha(policyDraftSchema.safeParse(draft).error?.issues)).toBe(
      "b167a7fadb1ee616f2c35f45659c75144d4ee24bcba5e77baa5a3732ecd98b9b",
    );
  });

  test("gives every rule of the draft schema the zh-HK message it has always had", () => {
    const cases: [PolicyValidationCode, (draft: PolicyDraft) => void][] = [
      ["tiers_duplicate", (d) => (d.eligibility.allowed_tiers = ["regular", "regular"])],
      ["weekdays_duplicate", (d) => (d.schedule.weekdays = [1, 1])],
      ["date_invalid", (d) => (d.schedule.effective_from = "2026-02-30")],
      ["credentials_any_empty", (d) => (d.eligibility.credentials = { mode: "any", keys: [] })],
      ["timezone_invalid", (d) => (d.timezone = "Not/AZone")],
      [
        "end_before_start",
        (d) => {
          d.schedule.start_time = "12:00";
          d.schedule.end_time = "09:00";
        },
      ],
      [
        "effective_range_invalid",
        (d) => {
          d.schedule.effective_from = "2026-10-02";
          d.schedule.effective_until = "2026-10-01";
        },
      ],
      [
        "keys_duplicate",
        (d) => {
          const role = { ...base("cat-cleaning-a").roles[0], reserved: 0, minimum: 0 };
          d.roles = [role, { ...role }];
        },
      ],
      [
        "window_order",
        (d) => {
          d.booking.individual_open = { mode: "hours_before", value: 24 };
          d.booking.individual_close = { mode: "hours_before", value: 48 };
        },
      ],
      ["group_size_order", (d) => (d.capacity.group_size = { minimum: 5, maximum: 2 })],
      ["leader_model", (d) => (d.capacity.role_count_model = "leader_in_assistants")],
      [
        "reserved_over_capacity",
        (d) => {
          d.capacity.volunteers = { state: "value", value: 5 };
          d.roles = [
            { ...base("cat-cleaning-a").roles[2], reserved: 6, maximum: { state: "unlimited" } },
          ];
        },
      ],
      [
        "minimum_over_capacity",
        (d) => {
          d.capacity.volunteers = { state: "value", value: 5 };
          d.roles = [
            { ...base("cat-cleaning-a").roles[2], minimum: 6, maximum: { state: "unlimited" } },
          ];
        },
      ],
      [
        "role_over_maximum",
        (d) => {
          d.roles = [
            {
              ...base("cat-cleaning-a").roles[2],
              minimum: 3,
              maximum: { state: "value", value: 2 },
            },
          ];
        },
      ],
    ];
    for (const [code, change] of cases) {
      const draft = base();
      change(draft);
      expect(messagesOf(draft), code).toContain(ZH_VALIDATION[code]);
    }
    const release = (over: Record<string, unknown>) => ({
      key: "late",
      priority: 1,
      semantics: "dynamic",
      within_hours: 48,
      condition: { tiers: ["senior"], operator: "lt", threshold: 1 },
      action: { type: "relax_quota", quota: "newcomers", new_maximum: 5, scope: "session" },
      allowed_tiers: ["newcomer"],
      credentials: { mode: "all", keys: [] },
      weekdays: "preserve",
      ...over,
    });
    const withRules = (...rules: unknown[]) => {
      const draft = base("cat-cleaning-a");
      draft.release_rules = rules as PolicyDraft["release_rules"];
      return draft;
    };
    expect(messagesOf(withRules(release({}), release({ key: "late2" })))).toContain(
      ZH_VALIDATION.priority_duplicate,
    );
    expect(
      messagesOf(
        withRules(release({ action: { type: "release_reserved", pool: "nobody", quantity: 1 } })),
      ),
    ).toContain(ZH_VALIDATION.release_pool_invalid);
    expect(
      messagesOf(
        withRules(
          release({ action: { type: "release_reserved", pool: "leader", quantity: 1 } }),
          release({
            key: "late2",
            priority: 2,
            action: { type: "release_reserved", pool: "leader", quantity: 1 },
          }),
        ),
      ),
    ).toContain(ZH_VALIDATION.release_pool_duplicate);
    expect(
      messagesOf(
        withRules(
          release({
            action: { type: "relax_quota", quota: "nothing", new_maximum: 5, scope: "session" },
          }),
        ),
      ),
    ).toContain(ZH_VALIDATION.quota_missing);
  });

  test("gives the readiness list the zh-HK message it has always had, and the same list in English", () => {
    const open = base("cat-cleaning-a");
    open.capacity.shared_total = { state: "inherit" };
    open.capacity.volunteers = { state: "unlimited" };
    open.inheritance = ["schedule.location"];
    open.release_rules = [
      {
        key: "late",
        priority: 1,
        within_hours: 48,
        condition: { tiers: ["senior"], operator: "lt", threshold: 1 },
        action: { type: "relax_quota", quota: "newcomers", new_maximum: 5, scope: "shelter_day" },
        allowed_tiers: ["newcomer"],
        credentials: { mode: "all", keys: [] },
        weekdays: "preserve",
      },
    ];
    const zh = getPolicyReadiness(open).issues;
    const en = getPolicyReadiness(open, "en").issues;
    expect(en.map((issue) => issue.path)).toEqual(zh.map((issue) => issue.path));
    const text = (issues: { path: string; message: string }[], path: string) =>
      issues.find((issue) => issue.path === path)?.message;
    expect(text(zh, "capacity.shared_total")).toBe("需要解析繼承值");
    expect(text(zh, "capacity.volunteers")).toBe("啟用模板需要有限正數義工容量");
    expect(text(zh, "release_rules.0.semantics")).toBe("補位需要明選動態或一次釋放");
    expect(text(zh, "release_rules.0.action.daily_anchor")).toBe(
      "每日補位需要明選首場或末場作時間基準",
    );
    expect(text(zh, "inheritance")).toBe("請預覽解析共用／場地來源後發布");
    expect(text(zh, "schedule.start_time")).toBe("貓舍早上開始時間待設定");
    for (const issue of en) expectNoChineseText(issue.message);
    expect(text(en, "capacity.shared_total")).toBe(
      "An inherited value has to be resolved. Preview the policy to resolve it.",
    );
    expect(text(en, "inheritance")).toBe(
      "Preview the policy to resolve the shared and venue sources, then publish.",
    );
    // An unresolved setting with no reason is an unfinished one.
    const bare = base();
    (bare.schedule as { start_time: unknown }).start_time = { state: "unresolved" };
    expect(text(getPolicyReadiness(bare).issues, "schedule.start_time")).toBe("未完成設定");
    expect(text(getPolicyReadiness(bare, "en").issues, "schedule.start_time")).toBe(
      "This setting is not finished. Complete it.",
    );
  });

  test("gives every catalogue draft an English readiness list with no Chinese and no stored reason", () => {
    for (const policy of initialPolicyCatalogue) {
      for (const issue of getPolicyReadiness(policy, "en").issues) {
        expectNoChineseText(issue.message);
        expect(issue.message, issue.path).not.toContain("relax_quota");
      }
    }
  });
});

describe("the readers of the policy modules keep their zh-HK output", () => {
  test("the policy command (settings): a template that does not match its key is refused in zh-HK", async () => {
    const service = createPolicyService(async () => ({ kind: "ok" }));
    const draft = base();
    const error = await service
      .command("actor", {
        action: "save",
        template_key: "another-template",
        expected_revision: 0,
        body: draft,
      })
      .catch((caught: unknown) => caught);
    expect(
      (error as { issues: { message: string }[] }).issues.map((issue) => issue.message),
    ).toEqual(["模板識別不一致"]);
  });

  test("the daily quota command: a draft that is not ready is refused with the zh-HK reasons", async () => {
    const service = createDailyPolicyService(async () => ({ kind: "ok" }));
    const body = base("dog-cleaning-b");
    const error = await Promise.resolve()
      .then(() =>
        service.command("actor", {
          action: "preview",
          scope_key: "dog:daily_newcomers",
          service_date: "2026-10-10",
          expected_revision: 1,
          body,
        }),
      )
      .catch((caught: unknown) => caught);
    const messages = (error as { issues: { message: string }[] }).issues.map(
      (issue) => issue.message,
    );
    expect(messages).toContain("狗舍團體開放窗口待設定");
    expect(messages).toContain("每日新手按不同人或人次計算");
    expect(messages).toEqual(getPolicyReadiness(body).issues.map((issue) => issue.message));
  });

  test("the sources command: a draft to resolve is checked with the same zh-HK messages", () => {
    const body = base();
    body.eligibility.allowed_tiers = ["regular", "regular"];
    const result = sourceCommandSchema.safeParse({ action: "resolve", body });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("級別不可重複");
  });

  test("the assessment command: the monthly policy parses as it did, with its zh-HK reasons stored", () => {
    const result = assessmentCommandSchema.safeParse({
      kind: "save",
      body: initialMonthlyPolicy,
      expected_revision: 0,
    });
    expect(result.success).toBe(true);
    expect(
      JSON.stringify(result.success && result.data.kind === "save" ? result.data.body : null),
    ).toContain("保持恆常觀察期間及計法待選");
  });

  test("the public booking page and the session coverage read the parsed policy, not a message", () => {
    // Both call `policyDraftSchema` and use the data or the success flag only, so what they read is
    // the parsed catalogue: it parses to itself, and a draft with a broken rule still fails to parse.
    for (const policy of initialPolicyCatalogue) {
      const parsed = policyDraftSchema.safeParse(policy);
      expect(parsed.success).toBe(true);
      expect(parsed.success ? parsed.data : null).toEqual(policy);
    }
    const broken = base();
    broken.schedule.weekdays = [2, 2];
    expect(policyDraftSchema.safeParse(broken).success).toBe(false);
  });
});
