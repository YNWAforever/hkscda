import { defineAdminCopy } from "../i18n/copy";
import {
  formatAdminDate,
  formatAdminDateOrNull,
  formatAdminDateTime,
  formatAdminDateTimeOrNull,
  formatAdminMoney,
} from "../i18n/format";

/**
 * How the supporter screens write amounts and dates: the admin's Hong Kong formats in both
 * languages, with two decimals on an amount, so 123.45 shows its cents.
 */
export const crmFormatCopy = defineAdminCopy({
  zh: {
    /** An amount in cents, or a dash when there is none. */
    money: (cents: number | null | undefined) =>
      cents === null || cents === undefined ? "-" : formatAdminMoney(cents / 100, "zh"),
    /** A date, or a dash when there is none or it is not a date. */
    date: (value: string | null | undefined) => formatAdminDateOrNull(value, "zh") ?? "-",
    /** A date and time, or a dash when there is none or it is not a date. */
    dateTime: (value: string | null | undefined) => formatAdminDateTimeOrNull(value, "zh") ?? "-",
  },
  en: {
    money: (cents: number | null | undefined) =>
      cents === null || cents === undefined ? "-" : formatAdminMoney(cents / 100, "en"),
    date: (value: string | null | undefined) => (value ? formatAdminDate(value, "en") : "-"),
    dateTime: (value: string | null | undefined) =>
      value ? formatAdminDateTime(value, "en") : "-",
  },
});
