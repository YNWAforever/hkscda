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
 * The shapes a stored date can take: a calendar day (`2026-10-07`), or an ISO date-time with an
 * optional seconds part, fraction and zone (`2026-10-07T04:00:00Z`, `2026-10-07 04:00:00+00:00`).
 * Loose text such as "Room 5", which `new Date` would read as 1 May 2001, is not a date.
 */
const STORED_DATE_SHAPE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;

/** The date of a stored value, or `null` when there is none, it is blank or it is not a date. */
function storedDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return toDate(value);
  const text = value.trim();
  return STORED_DATE_SHAPE.test(text) ? toDate(text) : null;
}

/** The Hong Kong calendar day of a moment as `YYYY-MM-DD`, for a date input's value. */
export function hongKongDay(date: Date): string {
  const parts = hongKongParts(date);
  const pad = (part: string | undefined) => (part ?? "").padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/**
 * `formatAdminDate`, or `null` when there is no value, the text is blank or it is not a date,
 * so that the screen shows its own placeholder (a dash, say) instead of the raw text. A stored
 * calendar day (`2026-10-07`) is read as midnight UTC, which is the same day in Hong Kong.
 */
export function formatAdminDateOrNull(
  value: Date | string | null | undefined,
  language: AdminLanguage,
): string | null {
  const date = storedDate(value);
  return date ? dateText(date, hongKongParts(date), language) : null;
}

/** `formatAdminDateTime`, or `null` as `formatAdminDateOrNull` returns it. */
export function formatAdminDateTimeOrNull(
  value: Date | string | null | undefined,
  language: AdminLanguage,
): string | null {
  const date = storedDate(value);
  return date ? formatAdminDateTime(date, language) : null;
}

const NUMBER_LOCALE: Record<AdminLanguage, string> = { zh: "zh-HK", en: "en-US" };

/**
 * A number with thousands separators (`1,234` in both languages); `null` and `undefined`
 * show as 0. The count helper the page copy uses inside its messages.
 */
export function formatAdminNumber(
  value: number | null | undefined,
  language: AdminLanguage,
): string {
  return (value ?? 0).toLocaleString(NUMBER_LOCALE[language]);
}

/**
 * An English count with its noun: one gets the singular, every other number (0 included) the
 * plural. `pluralCount(1, "match", "matches")` is `1 match`; the plural defaults to the
 * singular with an s. English only: Chinese has no plural, so zh copy does not use it.
 */
export function pluralCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatAdminNumber(count, "en")} ${count === 1 ? singular : plural}`;
}

/**
 * `HK$1,234.00`, the same in both languages. `language` is accepted so that callers pass
 * it the same way they do to the date formatters, and a per-language difference can be
 * added here later without touching them.
 */
export function formatAdminMoney(amount: number, language: AdminLanguage): string {
  return `${amount < 0 ? "-" : ""}HK$${amountFormat.format(Math.abs(amount))}`;
}
