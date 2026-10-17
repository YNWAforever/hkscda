import { expect, test } from "bun:test";
import { volunteerJobHealth } from "./health";
const now = new Date("2026-10-13T03:00:00Z");
test("two consecutive failures and stale native success degrade; absent evidence is unknown", () => {
  expect(
    volunteerJobHealth(
      [
        { status: "failed", finished_at: "2026-10-13T02:00:00Z" },
        { status: "failed", finished_at: "2026-10-13T01:00:00Z" },
      ],
      now,
    ).state,
  ).toBe("degraded");
  expect(
    volunteerJobHealth([{ status: "complete", finished_at: "2026-10-13T00:00:00Z" }], now).state,
  ).toBe("degraded");
  expect(volunteerJobHealth([], now).state).toBe("unknown");
  expect(
    volunteerJobHealth(
      [
        { status: "complete", finished_at: "2026-10-13T02:00:00Z" },
        { status: "failed", finished_at: "2026-10-13T01:00:00Z" },
      ],
      now,
    ),
  ).toMatchObject({
    state: "healthy",
    consecutiveFailures: 0,
    lastFailureAt: "2026-10-13T01:00:00Z",
  });
});
