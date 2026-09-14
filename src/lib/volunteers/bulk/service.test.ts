import { expect, test } from "bun:test";
import { addHkDays, createBulkService, generationDates, hkDate, hkTimeLabel } from "./service";
test("Hong Kong date conversion and four-week weekdays ignore device timezone", () => {
  expect(hkDate(new Date("2026-09-14T16:30:00Z"))).toBe("2026-09-15");
  expect(addHkDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(generationDates("2026-09-15", "2026-10-12", [0, 1, 2, 3, 4, 5, 6], [])).toHaveLength(28);
  expect(generationDates("2026-09-15", "2026-10-12", [1], ["2026-09-21"])).toHaveLength(3);
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
