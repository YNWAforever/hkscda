import type { AdminLanguage } from "../../../lib/admin/language";

/**
 * Admin dates and money, always shown in Hong Kong time:
 *
 *   date       en `7 Oct 2026 (Wed)`; zh is year, month and day with the narrow weekday in
 *              brackets, e.g. the 7th of October 2026 is a Wednesday
 *   date-time  the date, then the 24-hour time: `7 Oct 2026 (Wed) 00:30`
 *   money      `HK$1,234.00` in both languages
 *
 * English is assembled from `en-US` parts in day-month-year order rather than read from
 * `en-GB`, because the `en-GB` data in recent ICU spells September "Sept", and the
 * result would then depend on the runtime that renders it.
 */
const TIME_ZONE = "Asia/Hong_Kong";

const numericParts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const monthShort = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short" });

const weekdayFormat: Record<AdminLanguage, Intl.DateTimeFormat> = {
  zh: new Intl.DateTimeFormat("zh-HK", { timeZone: TIME_ZONE, weekday: "narrow" }),
  en: new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }),
};

const amountFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** What to show for a value that is not a date: the text as it was, never a thrown error. */
function unreadable(value: Date | string): string {
  return typeof value === "string" ? value : "";
}

function hongKongParts(date: Date) {
  const parts: Record<string, string> = {};
  for (const part of numericParts.formatToParts(date)) parts[part.type] = part.value;
  return parts;
}

function dateText(date: Date, parts: Record<string, string>, language: AdminLanguage): string {
  const weekday = weekdayFormat[language].format(date);
  if (language === "zh") {
    // admin-copy-exempt: the year, month and day characters of the zh-HK date pattern
    return `${parts.year}年${parts.month}月${parts.day}日 (${weekday})`;
  }
  return `${parts.day} ${monthShort.format(date)} ${parts.year} (${weekday})`;
}

export function formatAdminDate(value: Date | string, language: AdminLanguage): string {
  const date = toDate(value);
  if (!date) return unreadable(value);
  return dateText(date, hongKongParts(date), language);
}

export function formatAdminDateTime(value: Date | string, language: AdminLanguage): string {
  const date = toDate(value);
  if (!date) return unreadable(value);
  const parts = hongKongParts(date);
  return `${dateText(date, parts, language)} ${parts.hour}:${parts.minute}`;
}

/**
 * `HK$1,234.00`, the same in both languages. `language` is accepted so that callers pass
 * it the same way they do to the date formatters, and a per-language difference can be
 * added here later without touching them.
 */
export function formatAdminMoney(amount: number, language: AdminLanguage): string {
  return `${amount < 0 ? "-" : ""}HK$${amountFormat.format(Math.abs(amount))}`;
}
