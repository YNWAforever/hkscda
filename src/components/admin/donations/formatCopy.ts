import { defineAdminCopy } from "../i18n/copy";
import {
  formatAdminDate,
  formatAdminDateOrNull,
  formatAdminDateTime,
  formatAdminDateTimeOrNull,
  formatAdminMoney,
} from "../i18n/format";

/**
 * How the payments screens write amounts and times: the admin's Hong Kong formats in both
 * languages, with two decimals on an amount. A Chinese time or day that is not a date is shown
 * as the server sent it.
 */
export const donationFormatCopy = defineAdminCopy({
  zh: {
    money: (cents: number) => formatAdminMoney(cents / 100, "zh"),
    /** The time of an entry in the recent activity list. */
    activityTime: (value: string) => formatAdminDateTimeOrNull(value, "zh") ?? value,
    /** A timestamp the server sent, such as when a job was created. */
    timestamp: (value: string) => formatAdminDateTimeOrNull(value, "zh") ?? value,
    /** A calendar day the server sent, such as the day a bank deposit arrived. */
    day: (value: string) => formatAdminDateOrNull(value, "zh") ?? value,
  },
  en: {
    money: (cents: number) => formatAdminMoney(cents / 100, "en"),
    activityTime: (value: string) => formatAdminDateTime(value, "en"),
    timestamp: (value: string) => formatAdminDateTime(value, "en"),
    day: (value: string) => formatAdminDate(value, "en"),
  },
});
