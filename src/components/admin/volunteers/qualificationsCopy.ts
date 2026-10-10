import { defineAdminCopy } from "../i18n/copy";
import { volunteerWorkspaceCopy } from "../volunteerWorkspaceCopy";

/** Copy for verifying a volunteer's identity, tier and qualifications (`VolunteerQualifications`). */
export const qualificationsCopy = defineAdminCopy({
  zh: {
    title: "義工身份與資格核實",
    intro: "只按已核實證據設定級別及課程資格。自填 Remark 不會授予技能；既有出席及名單會保留。",
    links: { directory: "返回義工名冊", calendar: "義工月曆" },
    loading: "載入中…",
    loadFailed: "未能載入身份資料。",
    reload: "重新載入",
    choose: "選擇義工",
    chooseOption: "請選擇待核實或已有身份",
    /** The status of a profile in the list of profiles. */
    status: (status: string) =>
      (({ pending: "待核實", active: "已核實" }) as Record<string, string>)[status] ?? "暫停",
    option: (name: string, status: string, tier: string) => `${name} · ${status} · ${tier}`,
    profile: {
      heading: (name: string) => `${name} · 身份核實`,
      record: "查看完整義工檔案及服務紀錄",
      birthDate: (date: string) => `出生日期：${date}`,
      notProvided: "未提供",
      tier: "核實級別",
      reason: "核實／更正理由與證據來源",
      joinedOn: "已核實加入日期（不詳留空）",
      coverageStart: "完整出席紀錄覆蓋起日（不詳留空）",
      coverageNote:
        "只有已核實且完整覆蓋的月份才可判斷零出席。請在理由記錄日期及覆蓋範圍的證據來源。",
      verify: "確認身份及級別",
      pause: "暫停新報名資格",
    },
    credential: {
      title: "核實課程／技能",
      label: "資格",
      choose: "請選擇",
      validFrom: "有效起日（香港時間）",
      expiry: "到期日（該日零時失效；可留空）",
      evidence: "核實證據紀錄",
      save: "儲存已核實資格",
      /** The name of a qualification in the list; one the list does not know shows nothing. */
      name: (label: string | undefined) => label ?? "",
      revoked: "已撤銷",
      verified: "已核實",
      noExpiry: "未設到期日",
      line: (name: string, state: string, expiry: string) => `${name} · ${state} · ${expiry}`,
      revoke: "撤銷資格",
    },
    saved: "更新已保存，核實歷史及未來場次跟進任務已保留。",
  },
  en: {
    title: volunteerWorkspaceCopy.en.pages.qualifications.label,
    intro:
      "Tiers and course qualifications are only set from verified evidence. A Remark that a volunteer fills in themselves does not grant a skill. Existing attendance and lists are kept.",
    links: { directory: "Back to the volunteer directory", calendar: "Volunteer calendar" },
    loading: "Loading…",
    loadFailed: "Could not load the profile data. ",
    reload: "Reload",
    choose: "Choose a volunteer",
    chooseOption: "Choose a profile awaiting verification or an existing one",
    status: (status: string) =>
      (({ pending: "Awaiting verification", active: "Verified" }) as Record<string, string>)[
        status
      ] ?? "Paused",
    option: (name: string, status: string, tier: string) => `${name} · ${status} · ${tier}`,
    profile: {
      heading: (name: string) => `${name} · Identity verification`,
      record: "View the full volunteer record and service history",
      birthDate: (date: string) => `Date of birth: ${date}`,
      notProvided: "Not provided",
      tier: "Verified tier",
      reason: "Reason for verifying or correcting, and the source of the evidence",
      joinedOn: "Verified joining date (leave blank if unknown)",
      coverageStart: "Start date of complete attendance records (leave blank if unknown)",
      coverageNote:
        "Zero attendance can only be judged for months that are verified and completely covered. Record the evidence for the dates and the coverage in the reason.",
      verify: "Confirm identity and tier",
      pause: "Pause eligibility for new registrations",
    },
    credential: {
      title: "Verify a course or skill",
      label: "Qualification",
      choose: "Choose",
      validFrom: "Valid from (Hong Kong time)",
      expiry: "Expiry date (not valid from 00:00 on that day; optional)",
      evidence: "Verification evidence record",
      save: "Save the verified qualification",
      name: (label: string | undefined) => label ?? "Unnamed qualification",
      revoked: "Revoked",
      verified: "Verified",
      noExpiry: "No expiry date",
      line: (name: string, state: string, expiry: string) => `${name} · ${state} · ${expiry}`,
      revoke: "Revoke qualification",
    },
    saved:
      "The update is saved. The verification history and the follow-up tasks for future sessions are kept.",
  },
});
