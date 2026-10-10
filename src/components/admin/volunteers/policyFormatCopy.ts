import { defineAdminCopy } from "../i18n/copy";
import {
  formatAdminDate,
  formatAdminDateOrNull,
  formatAdminDateTime,
  formatAdminDateTimeOrNull,
} from "../i18n/format";

/** The shared Chinese date; text that is not a date is shown as it is. */
const zhDate = (value: string) => formatAdminDateOrNull(value, "zh") ?? value;
/** The shared Chinese date and time; text that is not a date is shown as it is. */
const zhDateTime = (value: string) => formatAdminDateTimeOrNull(value, "zh") ?? value;

/**
 * How the volunteer policy and settings screens write dates and times: the admin's Hong Kong
 * formats in both languages, with the date as `7 Oct 2026 (Wed)` in English. The daily quota's
 * session start is a time of day only, in the time zone of the quota. Each name says where it is
 * used.
 */
export const policyFormatCopy = defineAdminCopy({
  zh: {
    /** A calendar day that is stored as a day (`2026-10-09`). */
    day: zhDate,
    /** The day a published policy version takes effect, on the policy settings. */
    policyVersionDate: zhDate,
    /** A session's start time on the daily quota screen, in the time zone of the quota. */
    dailyClock: (value: string, timeZone: string) =>
      // admin-format-ok: a time of day only, in the quota's own time zone
      new Date(value).toLocaleTimeString("zh-HK", { timeZone, hour: "2-digit", minute: "2-digit" }),
    /** A session or a rule boundary on the policy simulation. */
    simulationDateTime: zhDateTime,
    /** The day a qualification stops being valid. */
    credentialExpiry: zhDate,
    /** A moment the database stored, such as when a senior candidate was found. */
    storedMoment: zhDateTime,
  },
  en: {
    day: (value: string) => formatAdminDate(value, "en"),
    policyVersionDate: (value: string) => formatAdminDate(value, "en"),
    dailyClock: (value: string, timeZone: string) =>
      // admin-format-ok: a time of day only, in the quota's own time zone
      new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value)),
    simulationDateTime: (value: string) => formatAdminDateTime(value, "en"),
    credentialExpiry: (value: string) => formatAdminDate(value, "en"),
    storedMoment: (value: string) => formatAdminDateTime(value, "en"),
  },
});
