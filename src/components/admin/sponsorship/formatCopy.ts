import { defineAdminCopy } from "../i18n/copy";
import {
  formatAdminDate,
  formatAdminDateOrNull,
  formatAdminDateTime,
  formatAdminDateTimeOrNull,
  formatAdminMoney,
} from "../i18n/format";

const MONTH_NAMES_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * A sponsorship month (`2026-08` or `2026-08-01`) as "Aug 2026". The month is read from the text,
 * not through a `Date`, so no time zone can move it: it is a calendar month, not a moment. Text
 * that is not a month is shown as its first seven characters, as Chinese shows every month.
 */
function englishMonth(value: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])/.exec(value);
  const name = match ? MONTH_NAMES_EN[Number(match[2]) - 1] : undefined;
  return match && name ? `${name} ${match[1]}` : value.slice(0, 7);
}

/**
 * How the sponsorship screens write amounts and dates. Both languages use the admin's Hong Kong
 * formats, with two decimals on an amount. A sponsorship month is a calendar month, not a moment,
 * and no shared month format exists: Chinese keeps it as stored (`2026-08`), and English writes
 * it as "Aug 2026".
 */
export const sponsorshipFormatCopy = defineAdminCopy({
  zh: {
    /**
     * One payment that was received. Deliberately WITHOUT the per-month suffix: section 6.4
     * requires that "one-off payments must not show '/month'". A HK$300 payment covering
     * three months is not a HK$300/month sponsorship, and labelling it that way misstates the
     * supporter's commitment. The cents are kept (section 6.3): 123.45 must not turn into 123.
     */
    money: (cents: number) => formatAdminMoney(cents / 100, "zh"),
    /** The pledge's monthly commitment, a rate, so it carries the per-month suffix. */
    monthly: (cents: number) => `${formatAdminMoney(cents / 100, "zh")}/月`,
    /** A date from a timestamp the server sent, or a dash when there is none or it is not a date. */
    date: (value: string | null | undefined) => formatAdminDateOrNull(value, "zh") ?? "-",
    /** A calendar day that is stored as a day, such as the day a payment was made. */
    day: (value: string) => formatAdminDateOrNull(value, "zh") ?? value,
    /** The Hong Kong day of a timestamp, or nothing when there is none or it is not a date. */
    isoDay: (value: string | null | undefined) => formatAdminDateOrNull(value, "zh") ?? "",
    /** A sponsorship month: `2026-08`. */
    month: (value: string) => value.slice(0, 7),
    /** The first day of a sponsorship month in a list of allocations, as stored. */
    periodStart: (value: string) => value,
    /** A moment the server sent, such as when a draft was made. */
    dateTime: (value: string) => formatAdminDateTimeOrNull(value, "zh") ?? value,
  },
  en: {
    money: (cents: number) => formatAdminMoney(cents / 100, "en"),
    monthly: (cents: number) => `${formatAdminMoney(cents / 100, "en")}/month`,
    date: (value: string | null | undefined) =>
      value?.trim() ? formatAdminDate(value.trim(), "en") : "-",
    day: (value: string) => formatAdminDate(value, "en"),
    isoDay: (value: string | null | undefined) => (value ? formatAdminDate(value, "en") : ""),
    month: englishMonth,
    periodStart: englishMonth,
    dateTime: (value: string) => formatAdminDateTime(value, "en"),
  },
});
