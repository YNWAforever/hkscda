/** Product-safe messages shared by volunteer HTTP boundaries and clients. */
const messages: Record<string, string> = {
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
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function volunteerErrorMessage(value: unknown, status = 500): string {
  const body = record(value);
  for (const candidate of [body.reason, body.code, body.kind]) {
    if (typeof candidate === "string" && messages[candidate]) return messages[candidate];
  }
  // Existing localized API errors are product copy. Never expose SQL/provider errors.
  if (
    typeof body.error === "string" &&
    /[\u3400-\u9fff]/.test(body.error) &&
    body.error.length <= 500
  )
    return body.error;
  return messages[
    status === 401
      ? "unauthorized"
      : status === 403
        ? "forbidden"
        : status === 404
          ? "not_found"
          : status === 409
            ? "conflict"
            : status === 400 || status === 422
              ? "invalid"
              : "unavailable"
  ];
}
export function normalizeVolunteerResult(
  value: unknown,
  suppliedStatus?: number,
): { body: unknown; status: number } {
  const result = record(value);
  const statusByKind: Record<string, number> = {
    invalid: 422,
    conflict: 409,
    not_found: 404,
    denied: 422,
    forbidden: 403,
    unauthorized: 401,
    error: 500,
  };
  const kind = typeof result.kind === "string" ? result.kind : "";
  const status =
    suppliedStatus && suppliedStatus >= 400
      ? suppliedStatus
      : (statusByKind[kind] ?? suppliedStatus ?? 200);
  if (status < 400) return { body: value, status };
  const code =
    [result.reason, result.code, result.kind].find(
      (v) => typeof v === "string" && /^[a-z_]{1,80}$/.test(v),
    ) ?? (status >= 500 ? "unavailable" : "invalid");
  return {
    status,
    body: {
      ...result,
      code,
      error: volunteerErrorMessage(result, status),
      retryable: status >= 500 || status === 429,
    },
  };
}
