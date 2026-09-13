import { expect, test } from "bun:test";
import { authorizedCron } from "./auth.server";
import {
  createVolunteerRuntimeJobs,
  dueAssessmentPeriod,
  type VolunteerJobRepository,
} from "./service";
test("cron authentication rejects missing and accepts exact bearer", () => {
  expect(authorizedCron(new Request("https://x"), "secret")).toBe(false);
  expect(
    authorizedCron(
      new Request("https://x", { headers: { authorization: "Bearer secret" } }),
      "secret",
    ),
  ).toBe(true);
});
test("one leased run invokes all consumers and never claims delivery", async () => {
  const calls: string[] = [];
  const r: VolunteerJobRepository = {
    claim: async () => true,
    finish: async () => {
      calls.push("finish");
    },
    generate: async () => {
      calls.push("generate");
      return 2;
    },
    persistReleases: async () => {
      calls.push("release");
      return 2;
    },
    promote: async () => {
      calls.push("promote");
      return 1;
    },
    assess: async () => {
      calls.push("assess");
      return true;
    },
    deferNotifications: async () => {
      calls.push("defer");
      return 3;
    },
  };
  expect(await createVolunteerRuntimeJobs(r, () => new Date("2026-09-13T01:20:00Z")).run()).toEqual(
    { kind: "complete", generated: 2, released: 2, promoted: 1, assessment: true, deferred: 3 },
  );
  expect(calls).toEqual(["generate", "release", "promote", "assess", "defer", "finish"]);
});
test("duplicate hourly lease performs no work", async () => {
  let worked = false;
  const r = {
    claim: async () => false,
    finish: async () => {},
    generate: async () => {
      worked = true;
      return 0;
    },
    persistReleases: async () => 0,
    promote: async () => 0,
    assess: async () => false,
    deferNotifications: async () => 0,
  };
  expect((await createVolunteerRuntimeJobs(r).run()).kind).toBe("busy");
  expect(worked).toBe(false);
});

test("monthly assessment reconciles after its due time and respects short months", () => {
  const policy = { assessment_day: 1, assessment_time: "09:00", short_month: "last_day" };
  expect(dueAssessmentPeriod(new Date("2026-09-01T00:59:00Z"), policy)).toBeNull();
  expect(dueAssessmentPeriod(new Date("2026-09-01T01:00:00Z"), policy)).toBe("2026-08-01");
  expect(dueAssessmentPeriod(new Date("2026-09-03T04:00:00Z"), policy)).toBe("2026-08-01");
  expect(
    dueAssessmentPeriod(new Date("2026-02-28T04:00:00Z"), {
      ...policy,
      assessment_day: 31,
      short_month: "skip",
    }),
  ).toBeNull();
  expect(
    dueAssessmentPeriod(new Date("2026-02-28T04:00:00Z"), { ...policy, assessment_day: 31 }),
  ).toBe("2026-01-01");
});
