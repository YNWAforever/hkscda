import { centsToHkd } from "../../../lib/donations/domain";
import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDate, formatAdminDateTime, formatAdminMoney } from "../i18n/format";

/**
 * How the payments screens write amounts and times. Chinese keeps what it has always shown: the
 * amount with cents only when there are some, the activity time as the zh-HK medium date and
 * time, and the other times and dates exactly as the server sent them. English uses the admin's
 * Hong Kong formats, with two decimals on an amount.
 */
export const donationFormatCopy = defineAdminCopy({
  zh: {
    money: (cents: number) => centsToHkd(cents),
    /** The time of an entry in the recent activity list. */
    activityTime: (value: string) =>
      new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      ),
    /** A timestamp the server sent, such as when a job was created. */
    timestamp: (value: string) => value,
    /** A calendar day the server sent, such as the day a bank deposit arrived. */
    day: (value: string) => value,
  },
  en: {
    money: (cents: number) => formatAdminMoney(cents / 100, "en"),
    activityTime: (value: string) => formatAdminDateTime(value, "en"),
    timestamp: (value: string) => formatAdminDateTime(value, "en"),
    day: (value: string) => formatAdminDate(value, "en"),
  },
});
