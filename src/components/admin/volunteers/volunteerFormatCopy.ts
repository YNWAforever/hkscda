import { formatSessionDate } from "../../site/volunteer/centreModel";
import { defineAdminCopy } from "../i18n/copy";
import {
  formatAdminDate,
  formatAdminDateOrNull,
  formatAdminDateTime,
  formatAdminDateTimeOrNull,
  formatAdminNumber,
} from "../i18n/format";

const HONG_KONG = "Asia/Hong_Kong";

// admin-format-ok: a time of day only (`15:30`); the shared formats always carry the date
const englishClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: HONG_KONG,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The shared Chinese date; text that is not a date is shown as it is. */
const zhDate = (value: string) => formatAdminDateOrNull(value, "zh") ?? value;
/** The shared Chinese date and time; text that is not a date is shown as it is. */
const zhDateTime = (value: string) => formatAdminDateTimeOrNull(value, "zh") ?? value;

/**
 * How the volunteer screens write dates and times: the admin's Hong Kong formats in both languages,
 * with the date as `7 Oct 2026 (Wed)` in English and a time as 24-hour `HH:mm`. The overview's
 * clock is a time of day only, the same in both languages. Each name says where it is used.
 */
export const volunteerFormatCopy = defineAdminCopy({
  zh: {
    /** A count, as the screens have always written it. */
    number: (value: number) => String(value),
    /** A session's start or end in the activity workspace, table and calendar. */
    sessionTime: (value: string) => zhDateTime(value),
    /** The clock time of a session on the overview: a time of day, which the shared formats do not offer. */
    clock: (value: string) =>
      // admin-format-ok: a time of day only (`15:30`), the same text as the English clock
      new Intl.DateTimeFormat("zh-HK", {
        timeZone: HONG_KONG,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value)),
    /** A session's date and time in the group and rescheduling lists. */
    operationsTime: (value: string) => zhDateTime(value),
    /** The date and time of the next published session on the overview, or its placeholder. */
    coverageDate: (value: string) =>
      formatAdminDateTimeOrNull(value, "zh") ?? formatSessionDate(value),
    /** A calendar day that is stored as a day (`2026-10-09`). */
    day: (value: string) => zhDate(value),
    /** A date on a volunteer's profile. */
    profileDate: (value: string) => zhDate(value),
    /** An activity's start or end, and the date of an activity filter, in the management screen. */
    managementDateTime: (value: string) => zhDateTime(value),
    /** The day a registration was made, in the management screen. */
    managementDate: (value: string) => zhDate(value),
    /** The activity's start on a registration's detail page. */
    registrationDateTime: (value: string) => zhDateTime(value),
    /** The day a group enquiry came in. */
    enquiryDate: (value: string) => zhDate(value),
    /** A session's day in the list of old registrations to match. */
    legacyDate: (value: string) => zhDate(value),
  },
  en: {
    number: (value: number) => formatAdminNumber(value, "en"),
    sessionTime: (value: string) => formatAdminDateTime(value, "en"),
    clock: (value: string) => englishClock.format(new Date(value)),
    operationsTime: (value: string) => formatAdminDateTime(value, "en"),
    coverageDate: (value: string) => formatAdminDateTime(value, "en"),
    day: (value: string) => formatAdminDate(value, "en"),
    profileDate: (value: string) => formatAdminDate(value, "en"),
    managementDateTime: (value: string) => formatAdminDateTime(value, "en"),
    managementDate: (value: string) => formatAdminDate(value, "en"),
    registrationDateTime: (value: string) => formatAdminDateTime(value, "en"),
    enquiryDate: (value: string) => formatAdminDate(value, "en"),
    legacyDate: (value: string) => formatAdminDate(value, "en"),
  },
});
