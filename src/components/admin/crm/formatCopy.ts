import { formatLegacyAdminDateTime } from "../adminPageCopy";
import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDate, formatAdminDateTime, formatAdminMoney } from "../i18n/format";

/**
 * How the supporter screens write amounts and dates. Chinese keeps the whole-dollar amount and
 * the dates it has always shown; English uses the admin's Hong Kong formats, with two decimals
 * on an amount.
 */
export const crmFormatCopy = defineAdminCopy({
  zh: {
    /** An amount in cents, or a dash when there is none. */
    money: (cents: number | null | undefined) =>
      cents === null || cents === undefined
        ? "-"
        : new Intl.NumberFormat("zh-HK", {
            style: "currency",
            currency: "HKD",
            maximumFractionDigits: 0,
          }).format(cents / 100),
    /** A date, or a dash when there is none. */
    date: (value: string | null | undefined) =>
      value
        ? new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium" }).format(new Date(value))
        : "-",
    /** A date and time, or a dash when there is none. */
    dateTime: (value: string | null | undefined) => formatLegacyAdminDateTime(value, "zh"),
  },
  en: {
    money: (cents: number | null | undefined) =>
      cents === null || cents === undefined ? "-" : formatAdminMoney(cents / 100, "en"),
    date: (value: string | null | undefined) => (value ? formatAdminDate(value, "en") : "-"),
    dateTime: (value: string | null | undefined) =>
      value ? formatAdminDateTime(value, "en") : "-",
  },
});
