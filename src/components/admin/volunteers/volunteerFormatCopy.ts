import { hkTimeLabel } from "../../../lib/volunteers/bulk/service";
import { formatSessionDate } from "../../site/volunteer/centreModel";
import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDate, formatAdminDateTime, formatAdminNumber } from "../i18n/format";

const HONG_KONG = "Asia/Hong_Kong";

const englishClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: HONG_KONG,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * How the volunteer screens write dates and times. Chinese keeps each format the screen has always
 * used, which differ from one screen to the next (some read the browser's own time zone, as they
 * always have); English uses the admin's Hong Kong formats, with the date as `7 Oct 2026 (Wed)` and
 * a time as 24-hour `HH:mm`. Each name says where it is used.
 */
export const volunteerFormatCopy = defineAdminCopy({
  zh: {
    /** A count, as the screens have always written it. */
    number: (value: number) => String(value),
    /** A session's start or end in the activity workspace, table and calendar. */
    sessionTime: (value: string) => hkTimeLabel(value),
    /** The clock time of a session on the overview. */
    clock: (value: string) =>
      new Intl.DateTimeFormat("zh-HK", {
        timeZone: HONG_KONG,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value)),
    /** A session's date and time in the group and rescheduling lists. */
    operationsTime: (value: string) =>
      new Date(value).toLocaleString("zh-HK", { timeZone: HONG_KONG, hour12: false }),
    /** The date of the next published session on the overview. */
    coverageDate: (value: string) => formatSessionDate(value),
    /** A calendar day that is stored as a day (`2026-10-09`). */
    day: (value: string) => value,
    /** A date on a volunteer's profile; text that is not a date is shown as it is. */
    profileDate: (value: string) => {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime())
        ? value
        : new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium", timeZone: HONG_KONG }).format(
            parsed,
          );
    },
    /** An activity's start or end, and the date of an activity filter, in the management screen. */
    managementDateTime: (value: string) =>
      new Date(value).toLocaleString("zh-HK", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: HONG_KONG,
      }),
    /** The day a registration was made, in the management screen. */
    managementDate: (value: string) =>
      new Date(value).toLocaleDateString("zh-HK", { dateStyle: "medium", timeZone: HONG_KONG }),
    /** The activity's start on a registration's detail page (the browser's own time zone). */
    registrationDateTime: (value: string) =>
      new Date(value).toLocaleString("zh-HK", { dateStyle: "medium", timeStyle: "short" }),
    /** The day a group enquiry came in (the browser's own time zone). */
    enquiryDate: (value: string) =>
      new Date(value).toLocaleDateString("zh-HK", { dateStyle: "medium" }),
    /** A session's day in the list of old registrations to match. */
    legacyDate: (value: string) =>
      new Date(value).toLocaleDateString("zh-HK", { timeZone: HONG_KONG }),
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
