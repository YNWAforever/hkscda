import { shelterLabel } from "../../site/volunteer/centreModel";
import { defineAdminCopy } from "../i18n/copy";

/**
 * The venues English has a name for. A venue key is defined by an admin and has no English name of
 * its own (the venue table holds one label), so any other key is an "Other venue" in English rather
 * than the stored key. Chinese names the same venues with `shelterLabel`, which the public pages use.
 */
const EN_SHELTERS: Record<string, string> = {
  cat: "Cat shelter",
  dog: "Dog shelter",
  cat_shelter: "Cat shelter",
  dog_shelter: "Dog shelter",
  adoption: "Adoption day",
};

/** Where a venue with no name falls among the unnamed venues of one list, so they can be told apart. */
export type UnnamedVenue = { position: number; total: number };

/** Whether English has a name for this venue key. */
export function isNamedShelter(key: string) {
  return Object.hasOwn(EN_SHELTERS, key);
}

function englishShelterName(key: string, unnamed?: UnnamedVenue) {
  if (isNamedShelter(key)) return EN_SHELTERS[key];
  return unnamed && unnamed.total > 1 ? `Other venue ${unnamed.position}` : "Other venue";
}

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
    /**
     * A venue key shown as a name; Chinese shows a key with no name as stored. English shows "Other
     * venue", numbered when `unnamed` says the list holds several (Chinese ignores it).
     */
    shelterName: (key: string, _unnamed?: UnnamedVenue) => shelterLabel(key),
    /**
     * A venue key as the activity table has always shown it: the key itself. The Chinese admin has
     * never shown a name there, so Chinese keeps the key; English shows the name, or "Other venue".
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
    shelterName: (key: string, unnamed?: UnnamedVenue) => englishShelterName(key, unnamed),
    shelterKey: (key: string) => englishShelterName(key),
    unknown: () => "Unknown",
  },
});
