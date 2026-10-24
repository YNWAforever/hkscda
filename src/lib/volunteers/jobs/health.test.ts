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

test("admin diagnostics project safe codes and stages without raw result fields", () => {
  const runs = [
    {
      status: "failed",
      finished_at: "2026-10-13T02:00:00Z",
      result: {
        error: "42501",
        stage: "generate",
        message: "synthetic-private-detail",
        correlationId: "synthetic-hidden",
      },
    },
    { status: "failed", finished_at: "2026-10-13T01:00:00Z" },
  ];
  expect(volunteerJobHealth(runs, now).diagnostic).toBeUndefined();
  const health = volunteerJobHealth(runs, now, undefined, true);
  expect(health.diagnostic).toEqual({
    code: "42501",
    stage: "generate",
    since: "2026-10-13T01:00:00Z",
  });
  expect(JSON.stringify(health)).not.toContain("synthetic-private");
  expect(JSON.stringify(health)).not.toContain("synthetic-hidden");
});

test("unknown private errors are not promoted into display codes or stages", () => {
  const health = volunteerJobHealth(
    [
      {
        status: "failed",
        finished_at: "2026-10-13T02:00:00Z",
        result: { error: "synthetic-private-detail", stage: "synthetic-private-stage" },
      },
      { status: "failed", finished_at: "2026-10-13T01:00:00Z" },
    ],
    now,
    undefined,
    true,
  );
  expect(health.diagnostic).toEqual({ code: null, since: "2026-10-13T01:00:00Z" });
  expect(JSON.stringify(health)).not.toContain("synthetic-private");
});

test("a code-shaped private string is not treated as a known diagnostic code", () => {
  const health = volunteerJobHealth(
    [
      {
        status: "failed",
        finished_at: "2026-10-13T02:00:00Z",
        result: { error: "ABCDE", stage: "finish" },
      },
      { status: "failed", finished_at: "2026-10-13T01:00:00Z" },
    ],
    now,
    undefined,
    true,
  );
  expect(health.diagnostic).toEqual({ code: null, stage: "finish", since: "2026-10-13T01:00:00Z" });
});

test("healthy health omits old failure diagnostics even for admin", () => {
  const health = volunteerJobHealth(
    [
      { status: "complete", finished_at: "2026-10-13T02:30:00Z" },
      {
        status: "failed",
        finished_at: "2026-10-13T02:00:00Z",
        result: { error: "42501", stage: "generate" },
      },
    ],
    now,
    undefined,
    true,
  );
  expect(health.state).toBe("healthy");
  expect(health.diagnostic).toBeUndefined();
});

test("stale success does not resurrect a failure resolved before that success", () => {
  const health = volunteerJobHealth(
    [
      { status: "complete", finished_at: "2026-10-13T00:15:00Z" },
      {
        status: "failed",
        finished_at: "2026-10-13T00:00:00Z",
        result: { error: "42501", stage: "generate" },
      },
    ],
    now,
    undefined,
    true,
  );
  expect(health.state).toBe("degraded");
  expect(health.consecutiveFailures).toBe(0);
  expect(health.diagnostic).toBeUndefined();
});

test("admin may inspect a current failure even when health evidence is still unknown", () => {
  const health = volunteerJobHealth(
    [
      {
        status: "failed",
        finished_at: "2026-10-13T02:15:00Z",
        result: { error: "42501", stage: "preflight" },
      },
    ],
    now,
    undefined,
    true,
  );
  expect(health.state).toBe("unknown");
  expect(health.diagnostic).toEqual({
    code: "42501",
    stage: "preflight",
    since: "2026-10-13T02:15:00Z",
  });
});

test("a bucket start is not presented as an unknown failure timestamp", () => {
  const health = volunteerJobHealth(
    [
      { status: "failed", finished_at: "2026-10-13T02:15:00Z", result: { error: "42501" } },
      { status: "failed", finished_at: null, bucket: "2026-10-13T01:00:00Z" },
    ],
    now,
    undefined,
    true,
  );
  expect(health.diagnostic?.since).toBe("2026-10-13T02:15:00Z");
});
