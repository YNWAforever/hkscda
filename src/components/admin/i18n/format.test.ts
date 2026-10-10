import { describe, expect, test } from "bun:test";
import {
  formatAdminDate,
  formatAdminDateOrNull,
  formatAdminDateTime,
  formatAdminDateTimeOrNull,
  formatAdminMoney,
  hongKongDay,
  pluralCount,
} from "./format";

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

describe("formatAdminDateOrNull and formatAdminDateTimeOrNull", () => {
  test("format a date like formatAdminDate and formatAdminDateTime", () => {
    for (const language of ["zh", "en"] as const) {
      for (const value of [
        "2026-10-06T16:30:00Z",
        "2026-10-07",
        new Date("2026-10-07T04:00:00Z"),
      ]) {
        expect(formatAdminDateOrNull(value, language)).toBe(formatAdminDate(value, language));
        expect(formatAdminDateTimeOrNull(value, language)).toBe(
          formatAdminDateTime(value, language),
        );
      }
    }
  });

  test("read a stored calendar day as that same day", () => {
    expect(formatAdminDateOrNull("2026-10-07", "zh")).toBe("2026年10月7日 (三)");
    expect(formatAdminDateOrNull("2026-12-31", "zh")).toBe("2026年12月31日 (四)");
  });

  test("ignore spaces around the text", () => {
    expect(formatAdminDateOrNull(" 2026-10-07 ", "zh")).toBe("2026年10月7日 (三)");
  });

  test("return null for loose text that new Date would still read as a date", () => {
    // The trap the shape check closes: the runtime reads this as a date.
    expect(Number.isNaN(new Date("Room 5").getTime())).toBe(false);
    for (const value of [
      "Room 5",
      "5",
      "next week",
      "2026/10/07",
      "Oct 7 2026",
      "2026-10",
      "20261007",
    ]) {
      expect(formatAdminDateOrNull(value, "en"), value).toBeNull();
      expect(formatAdminDateOrNull(value, "zh"), value).toBeNull();
      expect(formatAdminDateTimeOrNull(value, "en"), value).toBeNull();
    }
  });

  test("accept the stored ISO shapes, with the same output as the existing formatters", () => {
    const shapes = [
      "2026-10-06T16:30:00Z",
      "2026-10-06T16:30:00.123456Z",
      "2026-10-06T16:30Z",
      "2026-10-06 16:30:00+00:00",
      "2026-10-07T00:30:00+08:00",
      "2026-10-07T00:30:00+0800",
    ];
    for (const value of shapes) {
      expect(formatAdminDateTimeOrNull(value, "en"), value).toBe("7 Oct 2026 (Wed) 00:30");
      expect(formatAdminDateTimeOrNull(value, "en"), value).toBe(formatAdminDateTime(value, "en"));
      expect(formatAdminDateOrNull(value, "zh"), value).toBe("2026年10月7日 (三)");
    }
  });

  test("return null for no value, blank text or text that is not a date", () => {
    for (const value of [null, undefined, "", "   ", "not a date", new Date(Number.NaN)]) {
      expect(formatAdminDateOrNull(value, "zh")).toBeNull();
      expect(formatAdminDateTimeOrNull(value, "zh")).toBeNull();
    }
  });
});

describe("hongKongDay", () => {
  test("is the Hong Kong calendar day, padded for a date input", () => {
    expect(hongKongDay(new Date("2026-10-06T16:30:00Z"))).toBe("2026-10-07");
    expect(hongKongDay(new Date("2026-10-06T15:59:00Z"))).toBe("2026-10-06");
    expect(hongKongDay(new Date("2026-01-05T04:00:00Z"))).toBe("2026-01-05");
    expect(hongKongDay(new Date("2026-12-31T16:30:00Z"))).toBe("2027-01-01");
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
