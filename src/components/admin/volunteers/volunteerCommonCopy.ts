import { defineAdminCopy } from "../i18n/copy";

const ZH_SHELTERS: Record<string, string> = {
  cat: "貓舍",
  dog: "狗舍",
  cat_shelter: "貓舍",
  dog_shelter: "狗舍",
  adoption: "領養日",
};

const EN_SHELTERS: Record<string, string> = {
  cat: "Cat shelter",
  dog: "Dog shelter",
  cat_shelter: "Cat shelter",
  dog_shelter: "Dog shelter",
  adoption: "Adoption day",
};

/**
 * Words several volunteer screens share: the labels of a registration type, an attendance status, an
 * activity status and type, a venue, and the prompt shown before leaving an unsaved policy draft.
 */
export const volunteerCommonCopy = defineAdminCopy({
  zh: {
    /** Asked before leaving a page whose policy draft has unsaved changes. */
    leaveDraftPrompt: "目前有未儲存修改，確定捨棄並離開？",
    /** Names the numbered links to the sections of a page. */
    stepsLabel: "本頁步驟",
    registrationType: {
      individual: "個人",
      group: "團體",
    },
    attendance: {
      not_marked: "未記錄",
      attended: "已出席",
      completed: "已完成",
      no_show: "缺席",
    },
    activityStatus: {
      draft: "草稿",
      published: "已發布",
      closed: "已關閉",
      cancelled: "已取消",
    },
    activityType: {
      volunteer_shift: "義工時段",
      group_activity: "團體活動",
      cleaning_day: "清潔日",
    },
    /** A venue key shown as a name; a key with no name is shown as stored. */
    shelterName: (key: string) => ZH_SHELTERS[key] ?? key,
    /**
     * A venue key as the activity table has always shown it: the key itself. The Chinese admin has
     * never shown a name there, so Chinese keeps the key; English shows the name.
     */
    shelterKey: (key: string) => key,
    /** A status, kind or reason the screen has no label for, shown as stored. */
    unknown: (stored: string) => stored,
  },
  en: {
    leaveDraftPrompt: "You have unsaved changes. Discard them and leave?",
    stepsLabel: "Steps on this page",
    registrationType: {
      individual: "Individual",
      group: "Group",
    },
    attendance: {
      not_marked: "Not recorded",
      attended: "Attended",
      completed: "Completed",
      no_show: "No-show",
    },
    activityStatus: {
      draft: "Draft",
      published: "Published",
      closed: "Closed",
      cancelled: "Cancelled",
    },
    activityType: {
      volunteer_shift: "Volunteer shift",
      group_activity: "Group activity",
      cleaning_day: "Cleaning day",
    },
    shelterName: (key: string) => EN_SHELTERS[key] ?? key,
    shelterKey: (key: string) => EN_SHELTERS[key] ?? key,
    unknown: () => "Unknown",
  },
});
