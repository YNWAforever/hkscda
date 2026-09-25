const messages: Record<string, string> = {
  current_terms_required: "請先請義工確認目前條款，再審批報名。",
  current_policy_required: "本場次尚未綁定已發布政策，請先於政策設定預覽及套用。",
  verified_profile_required: "義工身份尚未核實或已暫停，請先核實身份。",
  terms_required: "請先取得義工的明確條款同意。",
  credentials_required: "義工缺少本場次所需的已核實資格。",
  minimum_age_not_met: "義工未達本場次的最低年齡。",
  tier_not_allowed: "義工級別不符合本場次政策。",
  role_not_allowed: "義工不符合此職務的資格要求。",
  overlapping_duty: "義工已有另一個已確認的重疊時段，請先處理時間衝突。",
  duplicate_booking: "義工在此場次已有報名。",
  volunteer_submission_token_conflict: "此報名識別已用於其他內容，請重新開始報名。",
  volunteer_submission_token_expired: "此報名連結已過期，請重新開始報名。",
  volunteer_duplicate_active_registration: "你已報名此活動；請使用原有的狀態連結或聯絡職員。",
  group_scenario_mismatch: "本場次的已確認團體狀況與政策不符，請重新預覽政策。",
  activity_closed: "本場次目前未開放報名。",
  date_closed: "此日期不在目前政策的開放範圍。",
  not_open: "尚未到報名開放時間。",
  registration_closed: "已過報名截止時間。",
  capacity_full: "本場次名額已滿。",
  role_full: "此職務名額已滿。",
  reserved_for_core_role: "剩餘名額保留予指定核心職務。",
  tier_quota_full: "此級別的場次名額已滿。",
  daily_quota_full: "此義工已達共享每日名額限制。",
  tier_weekday_not_allowed: "此級別未開放此星期的報名。",
  daily_policy_not_bound: "尚未綁定此營運日期的共享每日政策，請於設定中處理。",
  attendance_correction_required: "此報名已有出席事實，請先使用附原因的出席更正流程。",
  attendance_activity_time_immutable: "本場次已有出席事實，不能更改歷史時間或場次身份。",
  immutable_policy_booking_shape: "已核實的單人報名不能更改為多人或其他報名種類。",
  policy_change_requires_versioned_preview: "請從政策設定預覽及套用時間或容量變更。",
  policy_identity_requires_review: "場次身份變更需要政策預覽。",
};
export function volunteerPolicyFailure(error: unknown): { code: string; message: string } | null {
  if (
    !error ||
    typeof error !== "object" ||
    !("message" in error) ||
    typeof error.message !== "string"
  )
    return null;
  const code = error.message.replace(/^volunteer_policy_denied:/, "");
  return messages[code] ? { code, message: messages[code] } : null;
}
