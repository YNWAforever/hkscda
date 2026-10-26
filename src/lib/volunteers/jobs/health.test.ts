import { expect, test } from "bun:test";
import { volunteerJobFailureCodes } from "./errors";
import { volunteerJobHealth } from "./health";

test("only admins receive a current failed bucket with an exact retry fence", () => {
  const runs = [
    {
      status: "failed",
      bucket: "2026-10-25T03:00:00+00:00",
      finished_at: "2026-10-25T03:15:00.123456+00:00",
      lease_until: null,
    },
  ];
  const now = new Date("2026-10-25T03:20:00Z");
  expect(volunteerJobHealth(runs, now, undefined, true).retryCandidate).toEqual({
    bucket: "2026-10-25T03:00:00+00:00",
    expectedUpdatedAt: "2026-10-25T03:15:00.123456+00:00",
  });
  expect(volunteerJobHealth(runs, now).retryCandidate).toBeUndefined();
});
for (const changes of [
  { status: "running" },
  { status: "complete" },
  { bucket: "2026-10-25T02:00:00Z" },
  { bucket: "2026-10-25T04:00:00Z" },
  { lease_until: "2026-10-25T03:21:00Z" },
  { lease_until: "invalid" },
  { lease_until: "infinity" },
  { lease_until: "-infinity" },
  { lease_until: undefined },
  { finished_at: null },
  { status: "running", lease_until: "2026-10-25T03:20:00Z" },
] as const) {
  test(`retry candidate fails closed for ${JSON.stringify(changes)}`, () => {
    const run = {
      status: "failed",
      bucket: "2026-10-25T03:00:00Z",
      finished_at: "2026-10-25T03:15:00Z",
      lease_until: null,
      ...changes,
    };
    expect(
      volunteerJobHealth([run], new Date("2026-10-25T03:20:00Z"), undefined, true).retryCandidate,
    ).toBeUndefined();
  });
}
test("an open lease stays healthy and an expired running lease is a degraded retry", () => {
  const now = new Date("2026-10-25T03:20:00Z");
  const recentSuccess = {
    status: "complete",
    bucket: "2026-10-25T02:00:00Z",
    finished_at: "2026-10-25T02:15:00Z",
  };
  const live = volunteerJobHealth(
    [
      {
        status: "running",
        bucket: "2026-10-25T03:00:00Z",
        finished_at: "2026-10-25T03:16:00Z",
        lease_until: "2026-10-25T03:26:00Z",
      },
      recentSuccess,
    ],
    now,
    undefined,
    true,
  );
  expect(live).toMatchObject({ state: "healthy", consecutiveFailures: 0 });
  expect(live.expiredLease).toBeUndefined();
  expect(live.retryCandidate).toBeUndefined();
  expect(
    volunteerJobHealth(
      [
        {
          status: "running",
          bucket: "2026-10-25T03:00:00Z",
          finished_at: "2026-10-25T03:10:00Z",
          lease_until: "2026-10-25T03:20:00Z",
        },
        recentSuccess,
      ],
      now,
    ).state,
  ).toBe("healthy");

  const expired = volunteerJobHealth(
    [
      {
        status: "running",
        bucket: "2026-10-25T03:00:00Z",
        finished_at: "2026-10-25T03:16:00Z",
        lease_until: "2026-10-25T03:19:00Z",
        result: { error: "42501", message: "synthetic-private-detail" },
      },
      recentSuccess,
    ],
    now,
    undefined,
    true,
  );
  expect(expired.state).toBe("degraded");
  expect(expired.expiredLease).toBe(true);
  expect(expired.retryCandidate).toEqual({
    bucket: "2026-10-25T03:00:00Z",
    expectedUpdatedAt: "2026-10-25T03:16:00Z",
  });
  expect(expired.diagnostic).toEqual({ code: "VOLUNTEER_JOB_LEASE_LOST" });
  expect(JSON.stringify(expired)).not.toContain("synthetic-private");
  expect(JSON.stringify(expired)).not.toContain("42501");

  const staff = volunteerJobHealth(
    [
      {
        status: "running",
        bucket: "2026-10-25T03:00:00Z",
        finished_at: "2026-10-25T03:16:00Z",
        lease_until: "2026-10-25T03:19:00Z",
        result: { message: "synthetic-private-detail" },
      },
      recentSuccess,
    ],
    now,
  );
  expect(staff).toMatchObject({ state: "degraded", expiredLease: true, consecutiveFailures: 0 });
  expect(staff.diagnostic).toBeUndefined();
  expect(staff.retryCandidate).toBeUndefined();
  expect(JSON.stringify(staff)).not.toContain("synthetic-private");
});

test("a missing or non-finite running lease is unfinished, and a later success closes an older one", () => {
  const now = new Date("2026-10-25T03:20:00Z");
  for (const lease_until of [null, undefined, "invalid", "infinity", "-infinity"] as const) {
    expect(
      volunteerJobHealth(
        [
          {
            status: "running",
            bucket: "2026-10-25T03:00:00Z",
            finished_at: "2026-10-25T03:16:00Z",
            lease_until,
          },
        ],
        now,
      ).expiredLease,
    ).toBe(true);
  }
  const recovered = volunteerJobHealth(
    [
      {
        status: "complete",
        bucket: "2026-10-25T03:00:00Z",
        finished_at: "2026-10-25T03:10:00Z",
      },
      {
        status: "running",
        bucket: "2026-10-25T02:00:00Z",
        finished_at: "2026-10-25T02:10:00Z",
        lease_until: "2026-10-25T02:20:00Z",
      },
    ],
    now,
    undefined,
    true,
  );
  expect(recovered.expiredLease).toBeUndefined();
  expect(recovered.state).toBe("healthy");
  expect(recovered.diagnostic).toBeUndefined();

  const previousHour = volunteerJobHealth(
    [
      {
        status: "running",
        bucket: "2026-10-25T02:00:00Z",
        finished_at: "2026-10-25T02:16:00Z",
        lease_until: "2026-10-25T02:20:00Z",
      },
    ],
    now,
    undefined,
    true,
  );
  expect(previousHour.expiredLease).toBe(true);
  expect(previousHour.retryCandidate).toBeUndefined();
});

test("a failed bucket with an expired lease remains eligible without reclaiming running work", () => {
  expect(
    volunteerJobHealth(
      [
        {
          status: "failed",
          bucket: "2026-10-25T03:00:00Z",
          finished_at: "2026-10-25T03:15:00Z",
          lease_until: "2026-10-25T03:10:00Z",
        },
      ],
      new Date("2026-10-25T03:20:00Z"),
      undefined,
      true,
    ).retryCandidate,
  ).toBeDefined();
});
const now = new Date("2026-10-13T03:00:00Z");
test("a live lease splits failure streaks without hiding an older expired lease", () => {
  const at = new Date("2026-10-13T03:00:00Z");
  const live = {
    status: "running",
    finished_at: "2026-10-13T02:30:00Z",
    lease_until: "2026-10-13T03:10:00Z",
  };
  expect(
    volunteerJobHealth(
      [
        { status: "failed", finished_at: "2026-10-13T02:45:00Z" },
        live,
        { status: "failed", finished_at: "2026-10-13T02:00:00Z" },
      ],
      at,
    ).consecutiveFailures,
  ).toBe(1);
  expect(
    volunteerJobHealth(
      [
        live,
        { status: "failed", finished_at: "2026-10-13T02:00:00Z" },
        { status: "failed", finished_at: "2026-10-13T01:00:00Z" },
      ],
      at,
    ),
  ).toMatchObject({ consecutiveFailures: 0, state: "unknown" });
  expect(
    volunteerJobHealth(
      [
        { status: "failed", finished_at: "2026-10-13T02:45:00Z" },
        {
          status: "running",
          finished_at: "2026-10-13T02:20:00Z",
          lease_until: "2026-10-13T02:30:00Z",
        },
        { status: "failed", finished_at: "2026-10-13T02:00:00Z" },
      ],
      at,
    ),
  ).toMatchObject({ consecutiveFailures: 2, expiredLease: true });
  const olderStuck = volunteerJobHealth(
    [
      live,
      { status: "failed", finished_at: "2026-10-13T02:00:00Z" },
      {
        status: "running",
        finished_at: "2026-10-13T01:10:00Z",
        lease_until: "2026-10-13T01:20:00Z",
      },
    ],
    at,
    undefined,
    true,
  );
  expect(olderStuck.consecutiveFailures).toBe(0);
  expect(olderStuck.expiredLease).toBe(true);
  expect(olderStuck.retryCandidate).toBeUndefined();
});

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

test("admin diagnostics keep every fixed volunteer job code", () => {
  for (const code of volunteerJobFailureCodes) {
    const health = volunteerJobHealth(
      [
        {
          status: "failed",
          finished_at: "2026-10-13T02:00:00Z",
          result: { error: code, message: "synthetic-private-detail" },
        },
        { status: "failed", finished_at: "2026-10-13T01:00:00Z" },
      ],
      now,
      undefined,
      true,
    );
    expect(health.diagnostic?.code).toBe(code);
    expect(JSON.stringify(health)).not.toContain("synthetic-private");
  }
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
