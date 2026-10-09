import { describe, expect, test } from "bun:test";
import { expectNoChineseText } from "../../components/admin/i18n/testing";
import {
  normalizeVolunteerResult,
  volunteerCodeMessage,
  volunteerCodeMessageFromText,
  volunteerErrorMessage,
} from "./apiResult";

describe("volunteer action errors", () => {
  test("policy invalid/conflict results have useful client error without changing their issues", () => {
    const issues = [{ path: "capacity.volunteers", message: "Required" }];
    const invalid = normalizeVolunteerResult({ kind: "invalid", issues });
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({
      issues,
      error: expect.stringContaining("設定欄位"),
      retryable: false,
    });
    expect(normalizeVolunteerResult({ kind: "conflict", reason: "stale_preview" })).toMatchObject({
      status: 409,
      body: { error: expect.stringContaining("重新預覽") },
    });
  });
  test("maps actual booking reasons and never leaks unknown database messages", () => {
    for (const reason of [
      "overlapping_duty",
      "not_open",
      "registration_closed",
      "cancellation_closed",
      "waitlist_full",
      "terms_required",
    ])
      expect(volunteerErrorMessage({ reason }, 422)).not.toContain(reason);
    const raw = "connection failed postgres://user:secret@private";
    expect(volunteerErrorMessage({ error: raw }, 500)).not.toContain("secret");
    expect(normalizeVolunteerResult({}, 503)).toMatchObject({ body: { retryable: true } });
  });
  test("preserves successful preview/list shapes including preview issues", () => {
    const preview = { preview_id: "synthetic", issues: [{ message: "needs review" }] };
    expect(normalizeVolunteerResult(preview)).toEqual({ body: preview, status: 200 });
  });
  test("authorization failures use an explicit next step", () => {
    expect(volunteerErrorMessage({}, 401)).toContain("重新登入");
    expect(volunteerErrorMessage({}, 403)).toContain("管理員");
  });
});

/**
 * Every message the volunteer API and the public volunteer pages have always shown, word for word as
 * it was before the English admin. The public pages (PolicySignup) and the server read these with
 * the default language, so they must not change.
 */
const ORIGINAL_ZH: Record<string, string> = {
  invalid: "請檢查標示的設定欄位，修正後重新預覽。",
  conflict: "資料已被更新，請重新整理及預覽後再試。",
  not_found: "找不到這筆記錄，請返回名單重新選擇。",
  denied: "目前未符合此操作條件，請查看場次要求或聯絡職員。",
  forbidden: "你沒有此操作權限，請聯絡管理員。",
  unauthorized: "登入已失效，請重新登入後再試。",
  unavailable: "暫時未能完成，請稍後重試；不要重複建立同一操作。",
  idempotency_payload_changed: "這次重試的內容與原操作不同，請重新預覽並建立新操作。",
  overlapping_duty: "你已有時段重疊的工作，請選擇其他場次。",
  not_open: "尚未到報名開放時間，請查看場次的報名日期。",
  registration_closed: "這個場次已截止報名，請選擇其他場次。",
  registrations_closed: "這個場次已停止接受新報名，已有報名仍然保留。",
  cancellation_closed: "已超過可自行取消的時間，請聯絡職員處理。",
  cancellation_disabled: "這個場次不接受自行取消，請聯絡職員。",
  capacity_full: "場次已滿；如提供候補，可按候補安排報名。",
  reserved_for_core_role: "剩餘名額保留予指定崗位，請查看候補或其他場次。",
  role_full: "所選崗位已滿，請查看候補或其他崗位。",
  tier_quota_full: "你的級別名額已滿，請查看候補或其他場次。",
  daily_quota_full: "當日同類名額已滿，請查看候補或其他日期。",
  waitlist_disabled: "這個場次不設候補，請選擇其他場次。",
  waitlist_full: "候補名額已滿，請選擇其他場次。",
  terms_required: "請先閱讀並同意目的場次的最新條款，再確認操作。",
  terms_changed: "場次條款已更新，請重新閱讀並確認。",
  legacy_session: "這個場次尚未完成政策設定，暫時不能報名，請聯絡職員。",
  policy_unresolved: "仍有營運規則未決定，請先完成相關設定並重新預覽。",
  verified_profile_required: "身份或資格尚未完成核實，請查看帳戶狀態或聯絡職員。",
  attendance_correction_required: "此報名已有出席記錄，請由職員填寫理由作更正。",
  session_not_ended: "場次尚未結束，暫時不能標記完成。",
  no_published_policy_for_date: "所選日期沒有已發布的有效政策，請先完成政策設定。",
  date_closed: "所選日期不開放服務，請檢查星期及除外日期。",
  session_already_generated: "這個日期及時段已有場次，請查看現有場次。",
  activity_closed: "場次已關閉，請重新選擇可操作的場次。",
  future_attendance: "場次尚未到可記錄出席的時間，請於服務後處理。",
  invalid_attendance_status: "請選擇有效的出席狀態。",
  registration_not_approved: "這筆報名尚未獲批准，請先檢查報名狀態。",
  waitlist_priority: "有較早登記且符合資格的候補者，請先處理該候補記錄。",
  selection_requires_narrower_filter: "符合條件的場次太多，請縮窄日期或篩選條件。",
  selection_changed: "已選場次的資料已改變，請重新選取並預覽。",
  template_mapping_required: "請先指定來源時段與目標政策時段的對應。",
  empty_or_excessive_selection: "請選取有效數量的場次後再繼續。",
  shared_day_exceeds_100: "同一天的場次超過批次安全上限，請縮窄選取範圍。",
  selection_expired: "這次選取已過期，請重新篩選及選取。",
  unknown_group: "找不到這個操作分組，請重新載入操作進度。",
  attendance_history_protected: "已有出席事實的場次不能直接更改，請使用出席更正流程。",
  target_date_preview_required: "請先選擇目標日期並預覽，再確認操作。",
  domain_validation_failed: "操作未通過目前政策驗證，請檢查預覽結果。",
  transaction_failed: "這個分組未能完成，資料已回復；請查看進度後重試。",
  stale_preview: "預覽後的資料已改變，請重新預覽並確認影響。",
};

describe("the volunteer messages in both languages", () => {
  test("the zh-HK text of every code is exactly what it was", () => {
    for (const [code, text] of Object.entries(ORIGINAL_ZH)) {
      expect(volunteerCodeMessage(code), code).toBe(text);
      expect(volunteerCodeMessage(code, "zh"), code).toBe(text);
      // A body with that code, reason or kind gets that text by default.
      expect(volunteerErrorMessage({ code }, 500), code).toBe(text);
      expect(volunteerErrorMessage({ reason: code }, 422), code).toBe(text);
      expect(volunteerErrorMessage({ kind: code }, 409), code).toBe(text);
    }
    expect(Object.keys(ORIGINAL_ZH)).toHaveLength(48);
  });

  test("every code has an English text that says what to do and holds no Chinese", () => {
    for (const code of Object.keys(ORIGINAL_ZH)) {
      const english = volunteerCodeMessage(code, "en") ?? "";
      expectNoChineseText(english);
      expect(english.length, code).toBeGreaterThan(20);
      expect(english.endsWith("."), code).toBe(true);
      expect(volunteerErrorMessage({ code }, 500, "en"), code).toBe(english);
    }
    expect(volunteerCodeMessage("never_seen")).toBeNull();
    expect(volunteerCodeMessage("never_seen", "en")).toBeNull();
  });

  test("a code nobody has seen gets the generic English message for the status, never Chinese", () => {
    const generic = volunteerErrorMessage({ code: "never_seen" }, 500, "en");
    expect(generic).toBe(
      "This could not be completed right now. Try again later and do not create the same action twice.",
    );
    expectNoChineseText(generic);
    expect(volunteerErrorMessage({ code: "never_seen" }, 401, "en")).toBe(
      "Your sign-in has expired. Sign in again and try again.",
    );
    expect(volunteerErrorMessage({ code: "never_seen" }, 403, "en")).toContain("permission");
    expect(volunteerErrorMessage({ code: "never_seen" }, 404, "en")).toContain("not found");
    expect(volunteerErrorMessage({ code: "never_seen" }, 409, "en")).toContain("updated");
    expect(volunteerErrorMessage({ code: "never_seen" }, 422, "en")).toContain("Check");
    expect(volunteerErrorMessage(null, 400, "en")).toContain("Check");
    expect(volunteerErrorMessage("text", undefined, "en")).toBe(generic);
  });

  test("the server's own Chinese text is kept in Chinese and never shown in English", () => {
    const body = { error: "請檢查日期、選取項目及操作欄位", code: "invalid_input" };
    expect(volunteerErrorMessage(body, 400)).toBe("請檢查日期、選取項目及操作欄位");
    expect(volunteerErrorMessage(body, 400, "zh")).toBe("請檢查日期、選取項目及操作欄位");
    expect(volunteerErrorMessage(body, 400, "en")).toBe(
      volunteerCodeMessage("invalid", "en") ?? "",
    );
    // English server text and text over 500 characters are not product copy in either language.
    expect(volunteerErrorMessage({ error: "Invalid volunteer id" }, 400)).toBe(ORIGINAL_ZH.invalid);
    expect(volunteerErrorMessage({ error: "中".repeat(501) }, 500)).toBe(ORIGINAL_ZH.unavailable);
    expect(volunteerErrorMessage({ error: "中".repeat(500) }, 500)).toBe("中".repeat(500));
  });

  test("a message can be found from its Chinese text, so the admin can show it in English", () => {
    expect(volunteerCodeMessageFromText(ORIGINAL_ZH.forbidden)).toBe(
      volunteerCodeMessage("forbidden", "en"),
    );
    expect(volunteerCodeMessageFromText("not a message")).toBeNull();
  });

  test("normalising a result still writes the Chinese text, the code and whether to retry", () => {
    const invalid = normalizeVolunteerResult({ kind: "invalid", reason: "stale_preview" });
    expect(invalid).toEqual({
      status: 422,
      body: {
        kind: "invalid",
        reason: "stale_preview",
        code: "stale_preview",
        error: ORIGINAL_ZH.stale_preview,
        retryable: false,
      },
    });
    expect(normalizeVolunteerResult({}, 503)).toEqual({
      status: 503,
      body: { code: "unavailable", error: ORIGINAL_ZH.unavailable, retryable: true },
    });
    expect(normalizeVolunteerResult({ kind: "denied" })).toMatchObject({
      status: 422,
      body: { code: "denied", error: ORIGINAL_ZH.denied },
    });
  });
});
