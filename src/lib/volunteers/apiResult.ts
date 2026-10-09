import type { AdminLanguage } from "../admin/language";

/**
 * Product-safe messages shared by volunteer HTTP boundaries and clients, by code. The zh-HK text of
 * each is word for word what it has always been: the server still writes it into the `error` field
 * of a response (`normalizeVolunteerResult`) and the public volunteer pages still show it. The
 * English text is for the admin, which reads it with `volunteerErrorMessage(value, status, "en")`,
 * and every one says what to do next.
 */
const messages: Record<string, Record<AdminLanguage, string>> = {
  invalid: {
    zh: "請檢查標示的設定欄位，修正後重新預覽。",
    en: "Check the highlighted settings, fix them and preview again.",
  },
  conflict: {
    zh: "資料已被更新，請重新整理及預覽後再試。",
    en: "The data has been updated. Refresh the page, preview again and try again.",
  },
  not_found: {
    zh: "找不到這筆記錄，請返回名單重新選擇。",
    en: "This record was not found. Go back to the list and choose again.",
  },
  denied: {
    zh: "目前未符合此操作條件，請查看場次要求或聯絡職員。",
    en: "This action does not meet the current conditions. Check the session requirements or contact staff.",
  },
  forbidden: {
    zh: "你沒有此操作權限，請聯絡管理員。",
    en: "You do not have permission for this action. Contact an administrator.",
  },
  unauthorized: {
    zh: "登入已失效，請重新登入後再試。",
    en: "Your sign-in has expired. Sign in again and try again.",
  },
  unavailable: {
    zh: "暫時未能完成，請稍後重試；不要重複建立同一操作。",
    en: "This could not be completed right now. Try again later and do not create the same action twice.",
  },
  idempotency_payload_changed: {
    zh: "這次重試的內容與原操作不同，請重新預覽並建立新操作。",
    en: "This retry differs from the original action. Preview again and create a new action.",
  },
  overlapping_duty: {
    zh: "你已有時段重疊的工作，請選擇其他場次。",
    en: "You already have a duty at an overlapping time. Choose another session.",
  },
  not_open: {
    zh: "尚未到報名開放時間，請查看場次的報名日期。",
    en: "Registration has not opened yet. Check the session's registration dates.",
  },
  registration_closed: {
    zh: "這個場次已截止報名，請選擇其他場次。",
    en: "Registration for this session has closed. Choose another session.",
  },
  registrations_closed: {
    zh: "這個場次已停止接受新報名，已有報名仍然保留。",
    en: "This session has stopped taking new registrations and existing registrations are kept. Choose another session for a new registration.",
  },
  cancellation_closed: {
    zh: "已超過可自行取消的時間，請聯絡職員處理。",
    en: "The time for cancelling without staff has passed. Contact staff to handle it.",
  },
  cancellation_disabled: {
    zh: "這個場次不接受自行取消，請聯絡職員。",
    en: "This session does not allow cancelling without staff. Contact staff.",
  },
  capacity_full: {
    zh: "場次已滿；如提供候補，可按候補安排報名。",
    en: "The session is full. If a waitlist is offered, register on the waitlist.",
  },
  reserved_for_core_role: {
    zh: "剩餘名額保留予指定崗位，請查看候補或其他場次。",
    en: "The remaining places are reserved for a specific role. Check the waitlist or other sessions.",
  },
  role_full: {
    zh: "所選崗位已滿，請查看候補或其他崗位。",
    en: "The chosen role is full. Check the waitlist or other roles.",
  },
  tier_quota_full: {
    zh: "你的級別名額已滿，請查看候補或其他場次。",
    en: "The places for your tier are full. Check the waitlist or other sessions.",
  },
  daily_quota_full: {
    zh: "當日同類名額已滿，請查看候補或其他日期。",
    en: "The places of this kind for the day are full. Check the waitlist or other dates.",
  },
  waitlist_disabled: {
    zh: "這個場次不設候補，請選擇其他場次。",
    en: "This session has no waitlist. Choose another session.",
  },
  waitlist_full: {
    zh: "候補名額已滿，請選擇其他場次。",
    en: "The waitlist is full. Choose another session.",
  },
  terms_required: {
    zh: "請先閱讀並同意目的場次的最新條款，再確認操作。",
    en: "Read and agree to the latest terms of the destination session first, then confirm.",
  },
  terms_changed: {
    zh: "場次條款已更新，請重新閱讀並確認。",
    en: "The session terms have been updated. Read and confirm them again.",
  },
  legacy_session: {
    zh: "這個場次尚未完成政策設定，暫時不能報名，請聯絡職員。",
    en: "This session has no policy settings yet, so it cannot take registrations. Contact staff.",
  },
  policy_unresolved: {
    zh: "仍有營運規則未決定，請先完成相關設定並重新預覽。",
    en: "Some operating rules are still undecided. Finish the related settings and preview again.",
  },
  verified_profile_required: {
    zh: "身份或資格尚未完成核實，請查看帳戶狀態或聯絡職員。",
    en: "Identity or qualifications are not verified yet. Check the account status or contact staff.",
  },
  attendance_correction_required: {
    zh: "此報名已有出席記錄，請由職員填寫理由作更正。",
    en: "This registration already has an attendance record. Staff must correct it and enter a reason.",
  },
  session_not_ended: {
    zh: "場次尚未結束，暫時不能標記完成。",
    en: "The session has not ended, so it cannot be marked completed yet. Try again after it ends.",
  },
  no_published_policy_for_date: {
    zh: "所選日期沒有已發布的有效政策，請先完成政策設定。",
    en: "No published policy applies on the chosen date. Finish the policy settings first.",
  },
  date_closed: {
    zh: "所選日期不開放服務，請檢查星期及除外日期。",
    en: "The chosen date is not open for service. Check the weekdays and excluded dates.",
  },
  session_already_generated: {
    zh: "這個日期及時段已有場次，請查看現有場次。",
    en: "A session already exists for this date and time. Check the existing sessions.",
  },
  activity_closed: {
    zh: "場次已關閉，請重新選擇可操作的場次。",
    en: "The session is closed. Choose a session that can be used.",
  },
  future_attendance: {
    zh: "場次尚未到可記錄出席的時間，請於服務後處理。",
    en: "The session has not reached a time when attendance can be recorded. Try again after the service.",
  },
  invalid_attendance_status: {
    zh: "請選擇有效的出席狀態。",
    en: "Choose a valid attendance status.",
  },
  registration_not_approved: {
    zh: "這筆報名尚未獲批准，請先檢查報名狀態。",
    en: "This registration is not approved yet. Check its status first.",
  },
  waitlist_priority: {
    zh: "有較早登記且符合資格的候補者，請先處理該候補記錄。",
    en: "An earlier eligible volunteer is on the waitlist. Handle that waitlist record first.",
  },
  selection_requires_narrower_filter: {
    zh: "符合條件的場次太多，請縮窄日期或篩選條件。",
    en: "Too many sessions match. Narrow the dates or the filters.",
  },
  selection_changed: {
    zh: "已選場次的資料已改變，請重新選取並預覽。",
    en: "The selected sessions have changed. Select them again and preview.",
  },
  template_mapping_required: {
    zh: "請先指定來源時段與目標政策時段的對應。",
    en: "Match the source time slot to the target policy time slot first.",
  },
  empty_or_excessive_selection: {
    zh: "請選取有效數量的場次後再繼續。",
    en: "Select a valid number of sessions, then continue.",
  },
  shared_day_exceeds_100: {
    zh: "同一天的場次超過批次安全上限，請縮窄選取範圍。",
    en: "Sessions on one day exceed the safe limit for a batch. Narrow the selection.",
  },
  selection_expired: {
    zh: "這次選取已過期，請重新篩選及選取。",
    en: "This selection has expired. Filter and select again.",
  },
  unknown_group: {
    zh: "找不到這個操作分組，請重新載入操作進度。",
    en: "This batch was not found. Reload the operation progress.",
  },
  attendance_history_protected: {
    zh: "已有出席事實的場次不能直接更改，請使用出席更正流程。",
    en: "A session with attendance records cannot be changed directly. Use the attendance correction process.",
  },
  target_date_preview_required: {
    zh: "請先選擇目標日期並預覽，再確認操作。",
    en: "Choose the target date and preview first, then confirm the action.",
  },
  domain_validation_failed: {
    zh: "操作未通過目前政策驗證，請檢查預覽結果。",
    en: "The action did not pass the current policy checks. Review the preview result.",
  },
  transaction_failed: {
    zh: "這個分組未能完成，資料已回復；請查看進度後重試。",
    en: "This batch could not be completed and its data was restored. Check the progress, then retry.",
  },
  stale_preview: {
    zh: "預覽後的資料已改變，請重新預覽並確認影響。",
    en: "The data changed after the preview. Preview again and confirm the impact.",
  },
};

/** The code whose text fits an HTTP status, for when nothing else says more. */
const CODE_BY_STATUS: Record<number, string> = {
  400: "invalid",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  422: "invalid",
};

function messageCodeForStatus(status: number): string {
  return CODE_BY_STATUS[status] ?? "unavailable";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The English text of a zh-HK message in the table above, found by its exact zh-HK text. The admin
 * gets a zh-HK message in the `message` of an `AdminApiError`; this is how it is turned into English.
 */
export function volunteerCodeMessageFromText(text: string): string | null {
  const found = Object.values(messages).find((entry) => entry.zh === text);
  return found ? found.en : null;
}

/** The message for a code in the table above, or `null` when the code is not in it. */
export function volunteerCodeMessage(code: string, language: AdminLanguage = "zh"): string | null {
  return messages[code]?.[language] ?? null;
}

/**
 * Whether `volunteerErrorMessage` may hand a server's own `error` text on as it is: it holds
 * Chinese, so it was written for the admin and the public pages as product copy.
 */
function serverTextOf(body: Record<string, unknown>): string | null {
  return typeof body.error === "string" &&
    /[\u3400-\u9fff]/.test(body.error) &&
    body.error.length <= 500
    ? body.error
    : null;
}

/**
 * The message to show for an error body. A reason, code or kind in the table above wins; then the
 * server's own zh-HK text; then a message that fits the HTTP status. `language` defaults to zh-HK,
 * which is what the public volunteer pages and the server use, and that output has not changed.
 * English never shows the server's zh-HK text: it shows the status-based message instead, unless
 * `volunteerAdminErrorMessage` finds an English text for that exact server text first.
 */
export function volunteerErrorMessage(
  value: unknown,
  status = 500,
  language: AdminLanguage = "zh",
): string {
  const body = record(value);
  for (const candidate of [body.reason, body.code, body.kind]) {
    if (typeof candidate === "string" && messages[candidate]) return messages[candidate][language];
  }
  // Existing localized API errors are product copy. Never expose SQL/provider errors.
  const serverText = serverTextOf(body);
  if (language === "zh" && serverText !== null) return serverText;
  return messages[messageCodeForStatus(status)][language];
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
