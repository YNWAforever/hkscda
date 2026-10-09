import { defineAdminCopy } from "../i18n/copy";

/** Copy for matching an old registration to a volunteer profile (`VolunteerLegacyReconciliation`). */
export const legacyReconciliationCopy = defineAdminCopy({
  zh: {
    title: "舊報名身份核對",
    hint: "只連結有證據的同一人，不會以相同姓名或電郵自動合併。原有姓名、備註、報名政策及條款紀錄會保留；連結不代表批准。團體與已完成紀錄不在此更改。",
    loadFailed: "未能載入待核對名單，請重試。",
    reload: "重新載入",
    loading: "正在載入待核對名單…",
    registration: "待核對個人報名",
    choose: "請選擇",
    contact: (email: string) => `原報名聯絡：${email}。`,
    policyBound: "已有政策；連結後請義工登入並確認此場次最新條款，再由職員按政策審批。",
    policyNotBound: "尚未綁定政策；管理員須先在設定中心預覽並發佈套用於此場次的政策。",
    profile: "已核實義工",
    chooseProfile: "請選擇已核實身份",
    reason: "身份相符證據及核對理由",
    submit: "記錄核對並連結身份",
    linked: "身份已連結；請完成政策及本人條款確認後審批。",
  },
  en: {
    title: "Check the identity of old registrations",
    hint: "Only link a registration to a profile when there is evidence it is the same person. Nothing is merged automatically because a name or email matches. The original name, notes, registration policy and terms records are kept, and linking does not mean approval. Groups and completed records are not changed here.",
    loadFailed: "Could not load the list to check. Reload to try again.",
    reload: "Reload",
    loading: "Loading the list to check…",
    registration: "Individual registration to check",
    choose: "Choose",
    contact: (email: string) => `Original registration contact: ${email}. `,
    policyBound:
      "A policy applies. After linking, ask the volunteer to sign in and confirm the latest terms for this session, then staff approve it under the policy.",
    policyNotBound:
      "No policy is linked yet. An administrator must first preview and publish a policy for this session in the settings.",
    profile: "Verified volunteer",
    chooseProfile: "Choose a verified profile",
    reason: "Evidence that the identity matches, and the reason for the match",
    submit: "Record the check and link the profile",
    linked:
      "Profile linked. Finish the policy and the volunteer's own terms confirmation, then approve.",
  },
});
