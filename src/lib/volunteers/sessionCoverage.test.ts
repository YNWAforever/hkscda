import { describe, expect, test } from "bun:test";
import { getSessionCoverage } from "./sessionCoverage";

const now = new Date("2026-09-27T01:00:00Z");
const catPolicy = {
  id: "policy-cat",
  templateKey: "cat_morning",
  name: "貓舍上午",
  shelter: "cat",
  effectiveFrom: "2026-09-26T00:00:00+08:00",
  effectiveUntil: null,
  schedule: {
    enabled: true,
    startTime: "09:30",
    weekdays: [1, 2],
    excludedDates: ["2026-09-28"],
    effectiveFrom: null,
    effectiveUntil: null,
  },
};
const activities = [
  {
    id: "published-tue",
    templateKey: "cat_morning",
    shelter: "cat",
    startsAt: "2026-09-29T09:30:00+08:00",
    status: "published",
    policyVersionId: "policy-cat",
  },
  {
    id: "draft-mon",
    templateKey: "cat_morning",
    shelter: "cat",
    startsAt: "2026-10-05T09:30:00+08:00",
    status: "draft",
    policyVersionId: "policy-cat",
  },
];

describe("approved volunteer session coverage", () => {
  test("distinguishes published, unpublished and missing slots from days off", () => {
    const result = getSessionCoverage(
      { from: "2026-09-27", to: "2026-10-10", centre: "cat", policies: [catPolicy], activities },
      now,
    );
    expect(result).toMatchObject({
      state: "attention",
      scheduledSlots: 3,
      publishedSlots: 1,
      unpublishedSlots: 1,
      missingSlots: 1,
      offDays: 11,
      nextApprovedAt: "2026-09-29T09:30:00+08:00",
    });
    expect(result.blockers.map((item) => item.reason)).toEqual(["unpublished", "missing"]);
  });

  test("reports a fully covered seven-day window without counting six rest days as gaps", () => {
    const result = getSessionCoverage(
      {
        from: "2026-09-27",
        to: "2026-10-03",
        centre: "cat",
        policies: [catPolicy],
        activities,
      },
      now,
    );
    expect(result).toMatchObject({
      state: "covered",
      scheduledSlots: 1,
      publishedSlots: 1,
      missingSlots: 0,
      offDays: 6,
    });
  });

  test("a version outside its effective window is a policy blocker, not an off-day", () => {
    const result = getSessionCoverage(
      {
        from: "2026-09-27",
        to: "2026-10-10",
        centre: "cat",
        policies: [{ ...catPolicy, effectiveFrom: "2026-11-01T00:00:00+08:00" }],
        activities: [],
      },
      now,
    );
    expect(result).toMatchObject({
      state: "policy_inapplicable",
      scheduledSlots: null,
      missingSlots: null,
      offDays: null,
    });
  });

  test("partial policy gaps are not counted as rest days", () => {
    const result = getSessionCoverage(
      {
        from: "2026-09-27",
        to: "2026-10-10",
        centre: "cat",
        policies: [{ ...catPolicy, effectiveFrom: "2026-10-05T00:00:00+08:00" }],
        activities: [],
      },
      now,
    );
    expect(result).toMatchObject({
      state: "attention",
      scheduledSlots: 2,
      missingSlots: 2,
      inapplicableDays: 8,
      offDays: 4,
    });
  });

  test("a published row without a matching pinned policy cannot satisfy coverage", () => {
    const result = getSessionCoverage(
      {
        from: "2026-09-27",
        to: "2026-10-03",
        centre: "cat",
        policies: [catPolicy],
        activities: [
          {
            ...activities[0],
            policyVersionId: null,
          },
        ],
      },
      now,
    );
    expect(result).toMatchObject({
      state: "attention",
      scheduledSlots: 1,
      publishedSlots: 0,
      unpublishedSlots: 1,
      missingSlots: 0,
      nextApprovedAt: null,
    });
    expect(result.blockers[0]?.reason).toBe("policy_inapplicable");
  });

  test("absence of an approved policy is unknown coverage, not zero expected slots", () => {
    const result = getSessionCoverage(
      { from: "2026-09-27", to: "2026-10-10", centre: "cat", policies: [], activities: [] },
      now,
    );
    expect(result).toMatchObject({
      state: "no_approved_policy",
      scheduledSlots: null,
      missingSlots: null,
      offDays: null,
      nextApprovedAt: null,
    });
  });
});
