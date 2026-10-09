import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDate, formatAdminDateTime } from "../i18n/format";

const HONG_KONG = "Asia/Hong_Kong";

/**
 * How the volunteer policy and settings screens write dates and times. Chinese keeps each format the
 * screen has always used, which differ from one screen to the next (the policy settings read the
 * browser's own time zone, as they always have); English uses the admin's Hong Kong formats, with the
 * date as `7 Oct 2026 (Wed)` and a time as 24-hour `HH:mm`. Each name says where it is used.
 */
export const policyFormatCopy = defineAdminCopy({
  zh: {
    /** A calendar day that is stored as a day (`2026-10-09`). */
    day: (value: string) => value,
    /** The day a published policy version takes effect, on the policy settings (the browser's own time zone). */
    policyVersionDate: (value: string) => new Date(value).toLocaleDateString("zh-HK"),
    /** A session's start time on the daily quota screen, in the time zone of the quota. */
    dailyClock: (value: string, timeZone: string) =>
      new Date(value).toLocaleTimeString("zh-HK", { timeZone, hour: "2-digit", minute: "2-digit" }),
    /** A session or a rule boundary on the policy simulation. */
    simulationDateTime: (value: string) =>
      new Date(value).toLocaleString("zh-HK", { timeZone: HONG_KONG }),
    /** The day a qualification stops being valid. */
    credentialExpiry: (value: string) =>
      new Date(value).toLocaleDateString("zh-HK", { timeZone: HONG_KONG }),
    /** A moment the database stored, such as when a senior candidate was found: shown as it is stored. */
    storedMoment: (value: string) => value,
  },
  en: {
    day: (value: string) => formatAdminDate(value, "en"),
    policyVersionDate: (value: string) => formatAdminDate(value, "en"),
    dailyClock: (value: string, timeZone: string) =>
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
