import { expect, test } from "bun:test";
import { createSupabaseVolunteerRepository } from "./repository.server";

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
    requirements: {
      minAge: 21,
      allowedTiers: ["senior"],
      credentials: { mode: "all", keys: ["handling"] },
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
