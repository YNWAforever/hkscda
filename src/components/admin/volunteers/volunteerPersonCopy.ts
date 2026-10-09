import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";

/** Copy for a volunteer's person page (`VolunteerPersonDetail`, `PersonRecords`). */
export const volunteerPersonCopy = defineAdminCopy({
  zh: {
    notRecorded: "未記錄",
    /** A status the page has no label for: the stored value is not shown in English. */
    otherStatus: (stored: string) => `其他狀態（${stored}）`,
    unnamed: "未填姓名",
    noEmail: "未提供電郵",
    notLinked: "帳戶未連結",
    back: "返回名冊",
    verifyLink: "核實身份與資格",
    profileId: (id: string) => `身份編號：${id}`,
    emailState: {
      unlinked: "未連結",
      verified: "電郵已驗證",
      unverified: "電郵未驗證",
    },
    /** The account email and the staff verification of the profile, on one line. */
    accountLine: (emailState: string, verification: string) =>
      `帳戶電郵：${emailState} · 職員身份核實：${verification}`,
    verification: {
      verified: (date: string) => `已核實（${date}）`,
      awaiting: "待核實",
    },
    coverage: {
      title: "紀錄覆蓋範圍",
      text: (start: string | null, limit: number) =>
        `${start ? `歷史覆蓋起點：${start}` : "未設定歷史覆蓋起點"}。只顯示已連結此身份的紀錄；未連結的舊資料不會按姓名推測合併。每類最多顯示 ${limit} 筆；缺少紀錄不代表沒有服務或資格。`,
    },
    tabsLabel: "個人紀錄分類",
    tabs: {
      identity: "身份與資格",
      registrations: "報名",
      attendance: "出席與服務紀錄",
      audit: "核實紀錄",
    },
    identity: {
      title: "身份資料",
      birthDate: "出生日期",
      joinedOn: "加入日期",
      note: "電郵驗證與職員身份核實分開處理；更改身份及資格請使用核實工作區並提供證據。",
      evidenceTitle: "資格證據",
      showing: (shown: number, total: number) => `顯示 ${shown} / ${total} 筆`,
      none: "沒有已記錄的資格證據。",
      revoked: "· 已撤銷",
      validity: (from: string, until: string | null) =>
        `有效期間：${from} 至 ${until ?? "未設定到期日"}`,
      revokedOn: (date: string) => `撤銷日期：${date}`,
      evidence: (text: string | null) => `證據：${text || "未提供"}`,
    },
    registrations: {
      showing: (shown: number, total: number) => `顯示 ${shown} / ${total} 筆報名`,
      none: "尚未有已連結的報名。此義工仍可在名冊中查閱及核實。",
      attendanceLine: (attendance: string, hours: number | null) =>
        `出席：${attendance} · 服務時數：${hours === null ? "未記錄" : `${hours} 小時`}`,
      view: "查看報名及處理",
    },
    attendance: {
      showing: (shown: number, total: number) =>
        `顯示 ${shown} / ${total} 筆出席事實紀錄；時數只取已記錄數值，不由場次長度推算。`,
      none: "沒有已連結的出席事實紀錄。不能據此推算服務年資或時數。",
      correction: "出席更正",
      record: "出席紀錄",
      before: "更改前：",
      after: "更改後：",
      reason: (text: string | null) => `原因：${text || "未記錄原因"}`,
      related: "查看相關報名",
      statusNotRecorded: "未記錄出席狀態",
      hours: (hours: number | null) => (hours === null ? " · 服務時數未記錄" : ` · ${hours} 小時`),
    },
    audit: {
      showing: (shown: number, total: number) => `顯示 ${shown} / ${total} 筆核實紀錄`,
      none: "沒有已連結的核實紀錄。請以現有身份資料及證據核對。",
      events: {
        claim: "帳戶連結",
        verify: "身份核實",
        suspend: "身份暫停",
        credential: "資格授予",
        revoke: "資格撤銷",
        update_profile: "身份更新",
      },
      noReason: "未記錄原因",
      handledBy: (id: string) => `處理職員：${id}`,
    },
    loading: "正在載入個人紀錄…",
    loadFailed: "未能載入個人紀錄。身份可能不存在，或目前未能連線。",
    reload: "重新載入",
  },
  en: {
    notRecorded: "Not recorded",
    otherStatus: () => "Other status",
    unnamed: "No name entered",
    noEmail: "No email provided",
    notLinked: "Account not linked",
    back: "Back to the directory",
    verifyLink: "Verify identity and qualifications",
    profileId: (id: string) => `Profile reference: ${id}`,
    emailState: {
      unlinked: "Not linked",
      verified: "Email verified",
      unverified: "Email not verified",
    },
    accountLine: (emailState: string, verification: string) =>
      `Account email: ${emailState} · Staff identity verification: ${verification}`,
    verification: {
      verified: (date: string) => `Verified on ${date}`,
      awaiting: "Awaiting verification",
    },
    coverage: {
      title: "Record coverage",
      text: (start: string | null, limit: number) =>
        `${start ? `History coverage starts on ${start}` : "No history coverage start date is set"}. Only records linked to this profile are shown. Older data that is not linked is not matched by name. Up to ${formatAdminNumber(limit, "en")} records are shown for each type. Missing records do not mean there was no service or qualification.`,
    },
    tabsLabel: "Record categories",
    tabs: {
      identity: "Profile and qualifications",
      registrations: "Registrations",
      attendance: "Attendance and service records",
      audit: "Verification records",
    },
    identity: {
      title: "Profile details",
      birthDate: "Date of birth",
      joinedOn: "Joined on",
      note: "Email verification and staff identity verification are handled separately. To change a profile or qualification, use the verification workspace and provide evidence.",
      evidenceTitle: "Qualification evidence",
      showing: (shown: number, total: number) =>
        `Showing ${formatAdminNumber(shown, "en")} of ${formatAdminNumber(total, "en")}`,
      none: "No qualification evidence is recorded.",
      revoked: "· Revoked",
      validity: (from: string, until: string | null) =>
        `Valid from ${from} to ${until ?? "no expiry date set"}`,
      revokedOn: (date: string) => `Revoked on ${date}`,
      evidence: (text: string | null) => `Evidence: ${text || "not provided"}`,
    },
    registrations: {
      showing: (shown: number, total: number) =>
        `Showing ${formatAdminNumber(shown, "en")} of ${pluralCount(total, "registration")}`,
      none: "No registrations are linked yet. You can still view and verify this volunteer in the directory.",
      attendanceLine: (attendance: string, hours: number | null) =>
        `Attendance: ${attendance} · Service hours: ${hours === null ? "not recorded" : pluralCount(hours, "hour")}`,
      view: "View and handle registration",
    },
    attendance: {
      showing: (shown: number, total: number) =>
        `Showing ${formatAdminNumber(shown, "en")} of ${pluralCount(total, "attendance record")}. Hours are only taken from recorded values and are not worked out from the session length.`,
      none: "No linked attendance records. Length of service or hours cannot be worked out from this.",
      correction: "Attendance correction",
      record: "Attendance record",
      before: "Before the change: ",
      after: "After the change: ",
      reason: (text: string | null) => `Reason: ${text || "no reason recorded"}`,
      related: "View related registration",
      statusNotRecorded: "Attendance status not recorded",
      hours: (hours: number | null) =>
        hours === null ? " · Service hours not recorded" : ` · ${pluralCount(hours, "hour")}`,
    },
    audit: {
      showing: (shown: number, total: number) =>
        `Showing ${formatAdminNumber(shown, "en")} of ${pluralCount(total, "verification record")}`,
      none: "No linked verification records. Check against the existing profile details and evidence.",
      events: {
        claim: "Account linked",
        verify: "Identity verified",
        suspend: "Profile paused",
        credential: "Qualification granted",
        revoke: "Qualification revoked",
        update_profile: "Profile updated",
      },
      noReason: "No reason recorded",
      handledBy: (id: string) => `Handled by staff member: ${id}`,
    },
    loading: "Loading volunteer records…",
    loadFailed:
      "Could not load the volunteer records. The profile may not exist, or the connection may be down. Reload to try again, or go back to the directory.",
    reload: "Reload",
  },
});
