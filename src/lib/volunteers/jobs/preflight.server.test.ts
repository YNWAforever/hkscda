import { expect, test } from "bun:test";
import { validateVolunteerJobActor } from "./repository.server";
const id = "90000000-0000-4000-8000-000000000001";
function fixture(eligible: boolean, user: unknown) {
  const calls: unknown[] = [];
  const query = {
    select: () => query,
    eq: (key: string, value: string) => {
      calls.push([key, value]);
      return query;
    },
    maybeSingle: async () => ({ data: eligible ? { auth_user_id: id } : null, error: null }),
  };
  const client = {
    from: () => query,
    auth: {
      admin: {
        getUserById: async () => {
          calls.push("auth");
          return { data: { user }, error: null };
        },
      },
    },
  };
  return { client, calls };
}
test("malformed actor never reaches Supabase UUID lookup", async () => {
  const f = fixture(true, { email_confirmed_at: "2026-01-01" });
  await expect(validateVolunteerJobActor(f.client as never, "not-a-uuid")).rejects.toMatchObject({
    code: "VOLUNTEER_JOB_ACTOR_INVALID",
  });
  expect(f.calls).toEqual([]);
});
test("missing, disabled and non-admin fail the exact active-admin query", async () => {
  const f = fixture(false, null);
  await expect(validateVolunteerJobActor(f.client as never, id)).rejects.toMatchObject({
    code: "VOLUNTEER_JOB_ACTOR_INELIGIBLE",
  });
  expect(f.calls).toEqual([
    ["role", "admin"],
    ["status", "active"],
    ["auth_user_id", id],
  ]);
});
test("unconfirmed and banned auth users are ineligible; a confirmed active actor succeeds", async () => {
  for (const user of [
    null,
    { email_confirmed_at: null },
    { email_confirmed_at: "2026-01-01", banned_until: "2026-10-14T00:00:00Z" },
  ]) {
    await expect(
      validateVolunteerJobActor(
        fixture(true, user).client as never,
        id,
        () => new Date("2026-10-13T00:00:00Z"),
      ),
    ).rejects.toMatchObject({ code: "VOLUNTEER_JOB_ACTOR_INELIGIBLE" });
  }
  expect(
    await validateVolunteerJobActor(
      fixture(true, { email_confirmed_at: "2026-01-01" }).client as never,
      id,
    ),
  ).toBe(id);
});
