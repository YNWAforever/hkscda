import type { AdminLanguage } from "../admin/language";

/**
 * The zh-HK messages that the volunteer API routes send in an `error` field and that reach an admin
 * screen as they are: each has a code, its zh-HK text exactly as the server sends it, and an English
 * text that says what to do next. The server keeps sending the zh-HK text, and
 * `adminVolunteerServerMessages.test.ts` drives the real handlers through `fetchAdminJson` to keep
 * this table in step with them. The admin finds the English text with `volunteerServerErrorCode` and
 * `volunteerAdminErrorMessage`.
 *
 * A message is listed only when it can arrive intact. Many never do: `normalizeVolunteerResult` and
 * the `code` the policy checks send both replace the server's own `error` text with a message from
 * `apiResult`, which is bilingual already (the operations screen's ten group and rescheduling
 * reasons, the policy rules a booking can break that `apiResult` also covers, and the retired
 * "copy" command are all in that group). The test proves which is which. Messages that are already
 * English (`Invalid volunteer id`, `Request body too large`) are shown as they come.
 */
const VOLUNTEER_SERVER_TEXT = {
  // /api/admin/volunteers/overview (lib/volunteers/overview.ts)
  overview_invalid_centre: {
    zh: "服務地點無效",
    en: "The service location is not valid. Choose a location from the list and try again.",
  },
  overview_load_failed: {
    zh: "未能載入營運總覽，請重試。",
    en: "Could not load the operations overview. Try again.",
  },
  // /api/admin/volunteers/calendar (lib/volunteers/policy/calendar.server.ts)
  calendar_range_too_long: {
    zh: "日期範圍須在93日內",
    en: "The date range must be within 93 days. Choose a shorter range and try again.",
  },
  calendar_load_failed: {
    zh: "未能載入義工月曆，請稍後重試",
    en: "Could not load the volunteer calendar. Try again later.",
  },
  // /api/admin/volunteers/tasks (lib/volunteers/jobs/tasks.server.ts)
  tasks_invalid: {
    zh: "請檢查跟進資料",
    en: "Check the follow-up details and try again.",
  },
  tasks_update_failed: {
    zh: "未能更新跟進事項",
    en: "Could not update the follow-up. Try again.",
  },
  // /api/admin/volunteers/people (lib/volunteers/directory/http.server.ts)
  directory_not_found: {
    zh: "找不到義工身份",
    en: "The volunteer profile was not found. Go back to the directory and choose another profile.",
  },
  directory_invalid_search: {
    zh: "請檢查搜尋條件",
    en: "Check the search terms and try again.",
  },
  directory_forbidden: {
    zh: "沒有查閱權限",
    en: "You do not have permission to view this. Ask an administrator for access.",
  },
  directory_load_failed: {
    zh: "未能載入義工資料，請重試",
    en: "Could not load volunteer details. Try again.",
  },
  // /api/admin/volunteers/bulk (lib/volunteers/bulk/http.server.ts)
  invalid_request_body: {
    zh: "無效的要求內容",
    en: "The request could not be read. Reload the page and try again.",
  },
  bulk_invalid_fields: {
    zh: "請檢查日期、選取項目及操作欄位",
    en: "Check the dates, the selected items and the action fields, then try again.",
  },
  bulk_invalid_input: {
    zh: "設定無效，請重新預覽",
    en: "The settings are not valid. Preview again, then try again.",
  },
  bulk_failed: {
    zh: "未能完成操作；請查看已儲存的進度後重試",
    en: "The action could not be completed. Check the saved progress, then try again.",
  },
  // A registration or activity change that was refused (lib/volunteers/repository.server.ts)
  update_capacity_full: {
    zh: "活動名額不足，請重新檢查剩餘名額。",
    en: "There are not enough places in the activity. Check the places left and try again.",
  },
  update_future_attendance: {
    zh: "活動尚未開始或完成，不能記錄此出席狀態。",
    en: "The activity has not started or finished, so this attendance status cannot be recorded. Try again after the activity.",
  },
  update_attendance_correction_required: {
    zh: "已有出席事實，請選擇更正並填寫原因。",
    en: "Attendance has already been recorded. Choose to correct it and enter a reason.",
  },
  update_invalid_attendance_status: {
    zh: "只有已批准且未取消的活動報名可以記錄出席。",
    en: "Attendance can only be recorded for approved registrations of activities that are not cancelled. Check the registration status first.",
  },
  update_changed: {
    zh: "資料已更新，請重新檢查後再試。",
    en: "The data has been updated. Check it again, then try again.",
  },
  // /api/admin/volunteers/qualifications (lib/volunteers/policy/qualifications.server.ts)
  qualifications_invalid: {
    zh: "請檢查資格資料及核實理由",
    en: "Check the qualification details and the verification reason, then try again.",
  },
  qualifications_forbidden: {
    zh: "沒有核實資格權限",
    en: "You do not have permission to verify qualifications. Ask an administrator for access.",
  },
  qualifications_failed: {
    zh: "未能更新資格，請重新整理後重試",
    en: "Could not update the qualification. Refresh the page and try again.",
  },
  // A booking rule the database refused, by its code (lib/volunteers/policy/errors.ts). The rules
  // that `apiResult` also has a message for are not here: that message is what arrives.
  policy_current_terms_required: {
    zh: "請先請義工確認目前條款，再審批報名。",
    en: "Ask the volunteer to confirm the current terms before approving the registration.",
  },
  policy_current_policy_required: {
    zh: "本場次尚未綁定已發布政策，請先於政策設定預覽及套用。",
    en: "This session has no published policy linked. Preview and apply a policy in the policy settings first.",
  },
  policy_credentials_required: {
    zh: "義工缺少本場次所需的已核實資格。",
    en: "The volunteer lacks a verified qualification this session needs. Verify the qualification first.",
  },
  policy_minimum_age_not_met: {
    zh: "義工未達本場次的最低年齡。",
    en: "The volunteer is under the minimum age for this session. Choose another session.",
  },
  policy_tier_not_allowed: {
    zh: "義工級別不符合本場次政策。",
    en: "The volunteer's tier does not meet this session's policy. Choose another session.",
  },
  policy_role_not_allowed: {
    zh: "義工不符合此職務的資格要求。",
    en: "The volunteer does not meet the requirements of this role. Choose another role.",
  },
  policy_duplicate_booking: {
    zh: "義工在此場次已有報名。",
    en: "The volunteer is already registered for this session. Check the existing registration instead.",
  },
  policy_group_scenario_mismatch: {
    zh: "本場次的已確認團體狀況與政策不符，請重新預覽政策。",
    en: "The confirmed group situation for this session does not match the policy. Preview the policy again.",
  },
  policy_tier_weekday_not_allowed: {
    zh: "此級別未開放此星期的報名。",
    en: "This tier cannot register for this weekday. Choose another date.",
  },
  policy_daily_policy_not_bound: {
    zh: "尚未綁定此營運日期的共享每日政策，請於設定中處理。",
    en: "No shared daily policy is linked for this operating date. Set it up in the settings first.",
  },
  policy_attendance_activity_time_immutable: {
    zh: "本場次已有出席事實，不能更改歷史時間或場次身份。",
    en: "This session already has attendance records, so its time and identity cannot change. Change the other details only.",
  },
  policy_immutable_policy_booking_shape: {
    zh: "已核實的單人報名不能更改為多人或其他報名種類。",
    en: "A verified single-person registration cannot be changed to several people or another kind of registration. Create a new registration instead.",
  },
  policy_policy_change_requires_versioned_preview: {
    zh: "請從政策設定預覽及套用時間或容量變更。",
    en: "Preview and apply time or capacity changes from the policy settings.",
  },
  policy_policy_identity_requires_review: {
    zh: "場次身份變更需要政策預覽。",
    en: "Changing the identity of a session needs a policy preview. Preview it in the policy settings.",
  },
} as const satisfies Record<string, Record<AdminLanguage, string>>;

export type VolunteerServerErrorCode = keyof typeof VOLUNTEER_SERVER_TEXT;

/** The message for a server error code. Defaults to zh-HK, the text the API sends. */
export function volunteerServerErrorText(
  code: VolunteerServerErrorCode,
  language: AdminLanguage = "zh",
): string {
  return VOLUNTEER_SERVER_TEXT[code][language];
}

const CODES = Object.keys(VOLUNTEER_SERVER_TEXT) as VolunteerServerErrorCode[];

/** Every code in the table, for the tests that drive them all. */
export const VOLUNTEER_SERVER_ERROR_CODES: readonly VolunteerServerErrorCode[] = CODES;

/**
 * The code for a message that is exactly one of the zh-HK texts the volunteer API sends, or `null`
 * for any other text, which the admin shows as the status-based message.
 */
export function volunteerServerErrorCode(text: string): VolunteerServerErrorCode | null {
  return CODES.find((code) => VOLUNTEER_SERVER_TEXT[code].zh === text) ?? null;
}
