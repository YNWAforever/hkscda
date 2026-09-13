import { expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { createBookingRepository } from "./booking.repository.server";

const profile = { id: "profile-a", display_name: "Member", tier: "regular", status: "active" };
const activity = {
  id: "archived-session",
  title: "Past shelter session",
  starts_at: "2025-01-01T02:00:00Z",
  ends_at: "2025-01-01T05:00:00Z",
  location: "Shelter",
};
const registration = {
  id: "registration-a",
  activity_id: activity.id,
  status: "approved",
  attendance_status: "completed",
  notes: "Member supplied remarks",
  created_at: "2024-12-01T00:00:00Z",
  activity: { ...activity, internal_notes: "private activity notes", policy: "private policy" },
  internal_notes: "private service notes",
  contact_email: "private@example.test",
};
const history = {
  verified_sessions: 1,
  history_coverage_start: null,
  joined_on: null,
  credentials: [],
};

function fixture(
  options: {
    missingProfile?: boolean;
    missingActivity?: boolean;
    fail?: "profile" | "registrations" | "history";
  } = {},
) {
  const requests: { url: URL; body: unknown }[] = [];
  const client = createClient("https://unit-test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (async (input, init) => {
        const url = new URL(String(input));
        requests.push({
          url,
          body: init?.body ? (JSON.parse(String(init.body)) as unknown) : null,
        });
        const stage = url.pathname.endsWith("volunteer_profile")
          ? "profile"
          : url.pathname.endsWith("volunteer_registration")
            ? "registrations"
            : "history";
        if (options.fail === stage)
          return new Response(JSON.stringify({ message: stage + " unavailable", code: "XX000" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        const data =
          stage === "profile"
            ? options.missingProfile
              ? null
              : profile
            : stage === "registrations"
              ? [
                  {
                    ...registration,
                    activity: options.missingActivity ? null : registration.activity,
                  },
                ]
              : history;
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    },
  });
  return { repo: createBookingRepository(client), requests };
}

test("member history scopes profile, registrations and RPC to verified actor", async () => {
  const { repo, requests } = fixture();
  const result = await repo.me("verified-actor");
  expect(requests).toHaveLength(3);
  expect(requests[0].url.searchParams.get("auth_user_id")).toBe("eq.verified-actor");
  expect(requests[1].url.searchParams.get("profile_id")).toBe("eq.profile-a");
  expect(requests[2].body).toEqual({ p_actor: "verified-actor" });
  expect(result.history).toEqual(history);
  expect(result.registrations_limit).toBe(100);
  expect(requests[1].url.searchParams.get("limit")).toBe("100");
  expect(requests[1].url.searchParams.get("order")).toBe("created_at.desc,id.desc");
});

test("history retains past unpublished activity metadata with a minimal owned FK join", async () => {
  const { repo, requests } = fixture();
  const result = await repo.me("verified-actor");
  expect(result.registrations[0].activity).toEqual(activity);
  expect(result.registrations[0].created_at).toBe(registration.created_at);
  const query = requests[1].url.searchParams;
  expect(query.get("select")).toBe(
    "id,activity_id,status,attendance_status,notes,created_at,activity:volunteer_activity(id,title,starts_at,ends_at,location)",
  );
  expect(query.has("status")).toBe(false);
  expect(query.has("starts_at")).toBe(false);
  expect(query.has("activity.status")).toBe(false);
  expect(JSON.stringify(result)).not.toContain("private");
  expect(result.registrations[0].notes).toBe("Member supplied remarks");
});

test("missing activity keeps the owned registration with null metadata", async () => {
  const { repo } = fixture({ missingActivity: true });
  const result = await repo.me("verified-actor");
  expect(result.registrations).toHaveLength(1);
  expect(result.registrations[0].activity).toBeNull();
});

test("unclaimed actor cannot fall through to other profiles or history", async () => {
  const { repo, requests } = fixture({ missingProfile: true });
  expect(await repo.me("new-actor")).toEqual({
    profile: null,
    registrations: [],
    registrations_limit: 100,
  });
  expect(requests).toHaveLength(1);
});

for (const stage of ["profile", "registrations", "history"] as const) {
  test(stage + " failure rejects instead of inventing empty history", async () => {
    const { repo, requests } = fixture({ fail: stage });
    await expect(repo.me("verified-actor")).rejects.toMatchObject({
      message: stage + " unavailable",
    });
    expect(requests).toHaveLength(stage === "profile" ? 1 : stage === "registrations" ? 2 : 3);
  });
}
