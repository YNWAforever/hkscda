import { defineAdminCopy } from "../i18n/copy";
import {
  formatAdminDate,
  formatAdminDateOrNull,
  formatAdminDateTimeOrNull,
  formatAdminMoney,
} from "../i18n/format";

/** The coordinator report history's English time: the `Intl` medium date with a short time. */
function englishReportTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  // admin-format-ok: English keeps the report history's medium date and short time
  return new Intl.DateTimeFormat("en-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  }).format(date);
}

/**
 * How the case, adopter, intake, finalisation and coordinator report screens write dates and
 * fees. Both languages use the admin's Hong Kong formats; Chinese shows the HK$ amount with two
 * decimals, as English does. The English report history (`reportTime`) keeps the format it had
 * before Chinese moved to the shared one.
 */
export const adoptionFormatCopy = defineAdminCopy({
  zh: {
    /** A date or timestamp, or a dash when there is none or it is not a date. */
    date: (value: string | null | undefined) => formatAdminDateOrNull(value, "zh") ?? "-",
    /** The date of a case on the intake inbox and the adopter list. */
    listDay: (value: string | null | undefined) => formatAdminDateOrNull(value, "zh") ?? "-",
    /** A fee in cents, or a dash when there is none. */
    money: (cents: number | null | undefined) =>
      cents === null || cents === undefined ? "-" : formatAdminMoney(cents / 100, "zh"),
    /** The first and last day an applicant can visit; text that is not a day is shown as entered. */
    dateRange: (start: string, end: string) =>
      `${formatAdminDateOrNull(start, "zh") ?? start} - ${formatAdminDateOrNull(end, "zh") ?? end}`,
    /** When a coordinator report row was recorded. */
    reportTime: (value: string | null | undefined) => formatAdminDateTimeOrNull(value, "zh") ?? "-",
  },
  en: {
    date: (value: string | null | undefined) => {
      const text = value?.trim();
      return text ? formatAdminDate(text, "en") : "-";
    },
    listDay: (value: string | null | undefined) => formatAdminDateOrNull(value, "en") ?? "-",
    money: (cents: number | null | undefined) =>
      cents === null || cents === undefined ? "-" : formatAdminMoney(cents / 100, "en"),
    dateRange: (start: string, end: string) =>
      `${formatAdminDate(start, "en")} - ${formatAdminDate(end, "en")}`,
    reportTime: englishReportTime,
  },
});
