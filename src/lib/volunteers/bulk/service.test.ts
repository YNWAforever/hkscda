import { expect, test } from "bun:test";
import { expectNoChineseText } from "../../../components/admin/i18n/testing";
import {
  addHkDays,
  BulkInputError,
  bulkInputErrorText,
  createBulkService,
  generationDates,
  hkDate,
  hkTimeLabel,
} from "./service";
test("Hong Kong date conversion and four-week weekdays ignore device timezone", () => {
  expect(hkDate(new Date("2026-09-14T16:30:00Z"))).toBe("2026-09-15");
  expect(addHkDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(generationDates("2026-09-15", "2026-10-12", [0, 1, 2, 3, 4, 5, 6], [])).toHaveLength(28);
  expect(generationDates("2026-09-15", "2026-10-12", [1], ["2026-09-21"])).toHaveLength(3);
  expect(
    generationDates(
      "2026-09-15",
      addHkDays("2026-09-15", 55),
      [0, 1, 2, 3, 4, 5, 6],
      ["2026-09-22"],
    ),
  ).toHaveLength(55);
  expect(hkTimeLabel("2026-09-14T16:30:00Z")).toContain("00:30");
});
test("invalid operation input and excess per-request selection rejected before repository", () => {
  let calls = 0;
  const service = createBulkService(async () => {
    calls++;
    return {};
  });
  expect(() =>
    service.command("actor", {
      action: "preview",
      operation: "cancel",
      input: { template_keys: ["cat"], dates: ["2026-09-15"] },
      idempotency_key: crypto.randomUUID(),
    }),
  ).toThrow();
  expect(() =>
    service.command("actor", {
      action: "preview",
      operation: "attendance",
      selection_id: crypto.randomUUID(),
      input: { attendance_status: "completed", command: "correct" },
      idempotency_key: crypto.randomUUID(),
    }),
  ).toThrow();
  expect(calls).toBe(0);
});

test("dates that cannot be used are refused with a code, and the zh-HK message is plain text", () => {
  const refusal = (work: () => unknown) => {
    try {
      work();
    } catch (error) {
      return error;
    }
    return null;
  };
  for (const [from, until] of [
    ["", "2026-10-12"],
    ["2026-09-15", ""],
    ["2026-13-45", "2026-10-12"],
    ["not a date", "2026-10-12"],
  ]) {
    const error = refusal(() => generationDates(from, until, [1], []));
    expect(error).toBeInstanceOf(BulkInputError);
    expect((error as BulkInputError).code).toBe("invalid_date");
    // It used to be a zod error whose message was a block of JSON.
    expect((error as Error).message).toBe("日期無效");
  }
  for (const [from, until] of [
    ["2026-10-12", "2026-09-15"],
    ["2026-01-01", "2027-01-02"],
  ]) {
    const error = refusal(() => generationDates(from, until, [1], []));
    expect(error).toBeInstanceOf(BulkInputError);
    expect((error as BulkInputError).code).toBe("range_too_long");
    expect((error as Error).message).toBe("日期範圍須在一年內");
  }
  expect(generationDates("2026-01-01", "2026-12-31", [1], [])).toHaveLength(52);
});

test("each date problem has an English text that says what to change", () => {
  for (const code of ["invalid_date", "range_too_long"] as const) {
    const english = bulkInputErrorText(code, "en");
    expectNoChineseText(english);
    expect(english).toContain("preview again");
    expect(bulkInputErrorText(code)).toBe(bulkInputErrorText(code, "zh"));
    expect(new BulkInputError(code).message).toBe(bulkInputErrorText(code, "zh"));
  }
});

test("the time label still reads Chinese for the Hong Kong morning after a UTC evening", () => {
  expect(hkTimeLabel("2026-09-14T16:30:00Z")).toMatch(/9月15日/);
});
