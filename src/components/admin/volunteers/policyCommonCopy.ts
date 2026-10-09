import { defineAdminCopy } from "../i18n/copy";

const ZH_WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Words the volunteer policy screens share: the three tiers and the weekdays. */
export const policyCommonCopy = defineAdminCopy({
  zh: {
    tiers: { newcomer: "新手", regular: "恆常", senior: "資深" },
    /** A weekday by its number, 0 for Sunday. */
    weekday: (index: number) => `週${ZH_WEEKDAYS[index]}`,
  },
  en: {
    tiers: { newcomer: "Newcomer", regular: "Regular", senior: "Senior" },
    weekday: (index: number) => EN_WEEKDAYS[index],
  },
});
