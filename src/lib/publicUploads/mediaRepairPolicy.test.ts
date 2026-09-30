import { expect, test } from "bun:test";
import { MEDIA_REPAIR_MAX_ATTEMPTS, nextMediaRepairRetryAt } from "./mediaRepairPolicy";

test("repair retry delays are bounded and clock-injected", () => {
  const now = new Date("2026-09-27T00:00:00.000Z");
  const minutes = [1, 5, 15, 60, 360, 360, 360, 360];
  expect(MEDIA_REPAIR_MAX_ATTEMPTS).toBe(8);
  for (let attempts = 1; attempts <= 8; attempts++) {
    expect(nextMediaRepairRetryAt(attempts, now)).toBe(
      new Date(now.getTime() + minutes[attempts - 1] * 60_000).toISOString(),
    );
  }
});
