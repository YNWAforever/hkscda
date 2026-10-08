import { describe, expect, test } from "bun:test";
import { formatAdminDate, formatAdminDateTime, formatAdminMoney, pluralCount } from "./format";

describe("formatAdminDate", () => {
  test("formats a date as year-month-day with the weekday in Chinese", () => {
    expect(formatAdminDate("2026-10-07T04:00:00Z", "zh")).toBe("2026年10月7日 (三)");
  });

  test("formats a date as day-month-year with the weekday in English", () => {
    expect(formatAdminDate("2026-10-07T04:00:00Z", "en")).toBe("7 Oct 2026 (Wed)");
  });

  test("reads the date in Hong Kong time, just after local midnight", () => {
    // 16:30Z on 6 Oct is 00:30 on 7 Oct in Hong Kong.
    expect(formatAdminDate("2026-10-06T16:30:00Z", "en")).toBe("7 Oct 2026 (Wed)");
    expect(formatAdminDate("2026-10-06T16:30:00Z", "zh")).toBe("2026年10月7日 (三)");
  });

  test("keeps the previous Hong Kong day just before local midnight", () => {
    // 15:59Z on 7 Oct is 23:59 on 7 Oct in Hong Kong.
    expect(formatAdminDate("2026-10-07T15:59:00Z", "en")).toBe("7 Oct 2026 (Wed)");
    expect(formatAdminDate("2026-10-07T16:00:00Z", "en")).toBe("8 Oct 2026 (Thu)");
  });

  test("accepts a Date object", () => {
    expect(formatAdminDate(new Date("2026-10-07T04:00:00Z"), "en")).toBe("7 Oct 2026 (Wed)");
  });

  test("writes September as Sep and a Sunday as Sun, whatever the runtime's en-GB data says", () => {
    expect(formatAdminDate("2026-09-06T04:00:00Z", "en")).toBe("6 Sep 2026 (Sun)");
    expect(formatAdminDate("2026-09-06T04:00:00Z", "zh")).toBe("2026年9月6日 (日)");
  });

  test("does not pad the month or the day", () => {
    expect(formatAdminDate("2026-01-05T04:00:00Z", "zh")).toBe("2026年1月5日 (一)");
  });

  test("returns the raw text for a value that is not a date, instead of throwing", () => {
    expect(formatAdminDate("not a date", "en")).toBe("not a date");
    expect(formatAdminDate("", "zh")).toBe("");
    expect(formatAdminDate(new Date(Number.NaN), "en")).toBe("");
  });
});

describe("formatAdminDateTime", () => {
  test("adds a 24-hour Hong Kong time to the Chinese date", () => {
    expect(formatAdminDateTime("2026-10-06T16:30:00Z", "zh")).toBe("2026年10月7日 (三) 00:30");
  });

  test("adds a 24-hour Hong Kong time to the English date", () => {
    expect(formatAdminDateTime("2026-10-06T16:30:00Z", "en")).toBe("7 Oct 2026 (Wed) 00:30");
    expect(formatAdminDateTime("2026-10-07T15:59:00Z", "en")).toBe("7 Oct 2026 (Wed) 23:59");
  });

  test("returns the raw text for a value that is not a date, instead of throwing", () => {
    expect(formatAdminDateTime("soon", "zh")).toBe("soon");
  });
});

describe("formatAdminMoney", () => {
  test("writes HK$ with thousands separators and two decimals in English", () => {
    expect(formatAdminMoney(1234, "en")).toBe("HK$1,234.00");
  });

  test("writes the same text in Chinese", () => {
    expect(formatAdminMoney(1234, "zh")).toBe("HK$1,234.00");
  });

  test("handles zero, cents and large amounts", () => {
    expect(formatAdminMoney(0, "en")).toBe("HK$0.00");
    expect(formatAdminMoney(0.5, "en")).toBe("HK$0.50");
    expect(formatAdminMoney(1234567.891, "en")).toBe("HK$1,234,567.89");
  });

  test("puts the minus sign before the currency for a negative amount", () => {
    expect(formatAdminMoney(-1234.5, "en")).toBe("-HK$1,234.50");
  });
});

describe("pluralCount", () => {
  test("uses the singular for one and the plural for every other number", () => {
    expect(pluralCount(1, "conflict")).toBe("1 conflict");
    expect(pluralCount(3, "conflict")).toBe("3 conflicts");
    expect(pluralCount(0, "conflict")).toBe("0 conflicts");
    expect(pluralCount(2, "match", "matches")).toBe("2 matches");
    expect(pluralCount(1, "match", "matches")).toBe("1 match");
  });

  test("groups thousands like the other counts", () => {
    expect(pluralCount(1234, "record")).toBe("1,234 records");
  });
});
