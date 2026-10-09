import { centsToHkd } from "../../../lib/donations/domain";
import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDate, formatAdminDateTime, formatAdminMoney } from "../i18n/format";
import { formatDate } from "./pledgeReviewLogic";

/**
 * How the sponsorship screens write amounts and dates. Chinese keeps what it has always
 * shown: the amount with cents only when there are some, the date as the first ten characters
 * of the timestamp the server sent, and a stored day or month exactly as stored. English uses
 * the admin's Hong Kong formats, with two decimals on an amount.
 */
export const sponsorshipFormatCopy = defineAdminCopy({
  zh: {
    /**
     * One payment that was received. Deliberately WITHOUT the per-month suffix: section 6.4
     * requires that "one-off payments must not show '/month'". A HK$300 payment covering
     * three months is not a HK$300/month sponsorship, and labelling it that way misstates the
     * supporter's commitment. The cents are kept (section 6.3): 123.45 must not turn into 123.
     */
    money: (cents: number) => centsToHkd(cents),
    /** The pledge's monthly commitment, a rate, so it carries the per-month suffix. */
    monthly: (cents: number) => `${centsToHkd(cents)}/月`,
    /** A date from a timestamp the server sent, or a dash when there is none. */
    date: (value: string | null | undefined) => formatDate(value),
    /** A calendar day that is stored as a day, such as the day a payment was made. */
    day: (value: string) => value,
    /** A calendar day cut from a timestamp, or nothing when there is none. */
    isoDay: (value: string | null | undefined) => value?.slice(0, 10) ?? "",
    /** The first day of a sponsorship month in a list of allocations, as stored. */
    periodStart: (value: string) => value,
    /** A moment the server sent, such as when a draft was made. */
    dateTime: (value: string) => value,
  },
  en: {
    money: (cents: number) => formatAdminMoney(cents / 100, "en"),
    monthly: (cents: number) => `${formatAdminMoney(cents / 100, "en")}/month`,
    date: (value: string | null | undefined) =>
      value?.trim() ? formatAdminDate(value.trim(), "en") : "-",
    day: (value: string) => formatAdminDate(value, "en"),
    isoDay: (value: string | null | undefined) => (value ? formatAdminDate(value, "en") : ""),
    periodStart: (value: string) => value.slice(0, 7),
    dateTime: (value: string) => formatAdminDateTime(value, "en"),
  },
});
