import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDate, formatAdminMoney } from "../i18n/format";
import { formatDate, formatHkdCents } from "./caseWorkflowLogic";

/**
 * How the case, adopter and finalisation screens write dates and fees. Chinese keeps the
 * plain year-month-day and the fee without trailing zeros it has always shown; English uses
 * the admin's Hong Kong date format and the HK$ amount with two decimals.
 */
export const adoptionFormatCopy = defineAdminCopy({
  zh: {
    /** A date or timestamp, or a dash when there is none. */
    date: (value: string | null | undefined) => formatDate(value),
    /** A fee in cents, or a dash when there is none. */
    money: (cents: number | null | undefined) => formatHkdCents(cents),
    /** The first and last day an applicant can visit, as the applicant entered them. */
    dateRange: (start: string, end: string) => `${start} - ${end}`,
  },
  en: {
    date: (value: string | null | undefined) => {
      const text = value?.trim();
      return text ? formatAdminDate(text, "en") : "-";
    },
    money: (cents: number | null | undefined) =>
      cents === null || cents === undefined ? "-" : formatAdminMoney(cents / 100, "en"),
    dateRange: (start: string, end: string) =>
      `${formatAdminDate(start, "en")} - ${formatAdminDate(end, "en")}`,
  },
});
