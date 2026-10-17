import { expect, test } from "bun:test";
import { createSupabaseVolunteerRepository } from "./repository.server";
import { registrationReview } from "./registrationReview";

test("role-specific qualifications and effective capacity remain distinct from general conditions", () => {
  const review = registrationReview(
    { allowed: false, reason: "credentials_required", capacity: 8, confirmed: 8, remaining: 0 },
    {
      eligibility: {
        min_age: 21,
        allowed_tiers: ["regular", "senior"],
        credentials: { mode: "all", keys: [] },
      },
      roles: [
        {
          key: "leader",
          allowed_tiers: ["senior"],
          credentials: { mode: "all", keys: ["handling"] },
        },
      ],
    },
    "2026-10-17T01:00:00.000Z",
    "leader",
  );
  expect(review).toMatchObject({
    capacity: { capacity: 8, confirmed: 8, remaining: 0 },
    requirements: {
      credentials: { mode: "all", keys: [] },
      roleKey: "leader",
      role: {
        key: "leader",
        allowedTiers: ["senior"],
        credentials: { mode: "all", keys: ["handling"] },
      },
    },
  });
});

test("an unknown role remains unresolved and malformed capacity is never invented", () => {
  const review = registrationReview(
    { allowed: false, reason: "role_not_allowed", capacity: "8", confirmed: 7, remaining: 1 },
    {
      eligibility: {
        min_age: 21,
        allowed_tiers: ["regular"],
        credentials: { mode: "all", keys: [] },
      },
      roles: [
        {
          key: "leader",
          allowed_tiers: ["senior"],
          credentials: { mode: "all", keys: ["handling"] },
        },
      ],
    },
    "2026-10-17T01:00:00.000Z",
    "assistant",
  );
  expect(review).toMatchObject({ requirements: { roleKey: "assistant" } });
  expect(review).not.toHaveProperty("capacity");
  if (review.state === "evaluated") expect(review.requirements).not.toHaveProperty("role");
});

test("the server's generic volunteer role uses the published general conditions only when roles are empty", () => {
  const review = registrationReview(
    { allowed: true, reason: "available" },
    {
      eligibility: {
        min_age: 18,
        allowed_tiers: ["regular"],
        credentials: { mode: "all", keys: [] },
      },
      roles: [],
    },
    "2026-10-17T01:00:00.000Z",
    "volunteer",
  );
  expect(review).toMatchObject({
    requirements: {
      role: { key: "volunteer", allowedTiers: ["regular"], credentials: { mode: "all", keys: [] } },
    },
  });
});

function fixture(evaluation: unknown, rpcError: unknown = null) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const row = {
    id: "registration",
    activity_id: "activity",
    profile_id: "profile",
    duty_role: "leader",
  };
  const client = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data:
            table === "volunteer_registration"
              ? row
              : {
                  body: {
                    eligibility: {
                      min_age: 21,
                      allowed_tiers: ["senior"],
                      credentials: { mode: "all", keys: ["handling"] },
                    },
                  },
                },
          error: null,
        }),
        in: async () => ({ data: [{ id: "activity", capacity: 2 }], error: null }),
      };
      return query;
    },
    async rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return name === "volunteer_activity_counts"
        ? { data: [], error: null }
        : { data: evaluation, error: rpcError };
    },
  };
  return {
    calls,
    repo: createSupabaseVolunteerRepository(
      client as never,
      () => new Date("2026-10-17T01:00:00Z"),
    ),
  };
}

test("registration detail includes current server assessment excluding the registration itself", async () => {
  const { repo, calls } = fixture({
    allowed: false,
    reason: "credentials_required",
    policy_version_id: "policy",
    capacity: 2,
    remaining: 1,
    confirmed: 1,
    message: "private extra",
    unsafe: "never expose",
  });
  const detail = await repo.getRegistrationDetail("registration");
  expect(detail?.review).toEqual({
    state: "evaluated",
    asOf: "2026-10-17T01:00:00.000Z",
    allowed: false,
    reason: "credentials_required",
    policyVersionId: "policy",
    capacity: { capacity: 2, confirmed: 1, remaining: 1 },
    requirements: {
      minAge: 21,
      allowedTiers: ["senior"],
      credentials: { mode: "all", keys: ["handling"] },
      roleKey: "leader",
    },
  });
  expect(calls.filter((c) => c.name === "volunteer_policy_evaluate")).toEqual([
    {
      name: "volunteer_policy_evaluate",
      args: {
        p_activity: "activity",
        p_profile: "profile",
        p_role: "leader",
        p_now: "2026-10-17T01:00:00.000Z",
        p_exclude: "registration",
      },
    },
  ]);
});

test.each([null, {}, { allowed: "true", reason: "available" }])(
  "malformed assessment %p cannot become approval advice",
  async (evaluation) => {
    const { repo } = fixture(evaluation);
    expect((await repo.getRegistrationDetail("registration"))?.review).toEqual({
      state: "unavailable",
      asOf: "2026-10-17T01:00:00.000Z",
    });
  },
);
test("assessment read failure preserves the registration but reports unknown assessment", async () => {
  const { repo } = fixture({ allowed: true, reason: "available" }, { message: "read failed" });
  expect((await repo.getRegistrationDetail("registration"))?.review?.state).toBe("unavailable");
});
