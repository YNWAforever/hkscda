import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createVolunteerJobRepository } from "./repository.server";
function clientFor(errors: Array<unknown>) {
  let calls = 0;
  let offset = 0;
  const query = {
    select: () => query,
    eq: () => query,
    gt: () => query,
    order: () => query,
    or: () => query,
    maybeSingle: async () => ({ data: { auth_user_id: "synthetic-admin" }, error: null }),
    limit: async (size: number) => {
      const start = offset;
      offset += size;
      return {
        data: errors.slice(start, offset).map((_, i) => ({
          id: String(start + i),
          updated_at: "2026-09-13T00:00:00Z",
          created_at: "2026-09-13T00:00:00Z",
        })),
        error: null,
      };
    },
  };
  return {
    client: {
      from: () => query,
      rpc: async (name: string) =>
        name === "record_volunteer_promotion_review"
          ? { data: true, error: null }
          : { data: { kind: "updated" }, error: errors[calls++] },
    } as unknown as SupabaseClient,
    calls: () => calls,
  };
}
test("automatic promotion skips expected policy denials and reaches later eligible candidates", async () => {
  const fixture = clientFor([
    { code: "22023", message: "current_terms_required" },
    { code: "22023", message: "volunteer_policy_denied:overlapping_duty" },
    { code: "42501", message: "verified_profile_required" },
    null,
  ]);
  expect(
    await createVolunteerJobRepository(fixture.client, "synthetic-admin").promote(new Date()),
  ).toBe(1);
  expect(fixture.calls()).toBe(4);
});
test("automatic promotion still fails on audit/database errors", async () => {
  const failure = { code: "XX000", message: "synthetic audit failed" },
    fixture = clientFor([failure, null]);
  let thrown: unknown;
  try {
    await createVolunteerJobRepository(fixture.client, "synthetic-admin").promote(new Date());
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBe(failure);
  expect(fixture.calls()).toBe(1);
});

test("promotion reaches an eligible candidate beyond two hundred blocked entries", async () => {
  const fixture = clientFor([
    ...Array.from({ length: 200 }, () => ({ code: "22023", message: "current_terms_required" })),
    null,
  ]);
  expect(
    await createVolunteerJobRepository(fixture.client, "synthetic-admin").promote(new Date()),
  ).toBe(1);
  expect(fixture.calls()).toBe(201);
});
