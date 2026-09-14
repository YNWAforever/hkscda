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
          : url.pathname.endsWith("volunteer_member_registrations")
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
              ? {
                  registrations: [
                    {
                      ...registration,
                      activity: options.missingActivity ? null : registration.activity,
                    },
                  ],
                  upcoming_total: 0,
                  history_total: 1,
                  page_size: 25,
                }
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
  expect(requests[1].body).toEqual({
    p_actor: "verified-actor",
    p_upcoming_page: 1,
    p_history_page: 1,
    p_size: 25,
  });
  expect(requests[2].body).toEqual({ p_actor: "verified-actor" });
  expect(result.history).toEqual(history);
  expect(result.registrations_limit).toBe(25);
  expect(result.page_size).toBe(25);
});

test("history retains past unpublished activity metadata with a minimal owned FK join", async () => {
  const { repo, requests } = fixture();
  const result = await repo.me("verified-actor");
  expect(result.registrations[0].activity).toEqual(activity);
  expect(result.registrations[0].created_at).toBe(registration.created_at);
  expect(requests[1].url.pathname).toEndWith("volunteer_member_registrations");
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
    registrations_limit: 25,
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

test("public schedule applies Hong Kong filters and stable server page before returning rows", async () => {
  const requests: URL[] = [];
  const client = createClient("https://unit-test.invalid", "test-key", {
    auth: { persistSession: false },
    global: {
      fetch: (async (input) => {
        const url = new URL(String(input));
        requests.push(url);
        return Response.json(url.pathname.endsWith("volunteer_activity") ? [] : {});
      }) as typeof fetch,
    },
  });
  const repo = createBookingRepository(client, () => new Date("2026-09-01T00:00:00Z"));
  await repo.sessions({ page: 5, query: "Shelter", shelter: "dog", date: "2026-10-20" });
  expect(requests[0].searchParams.get("offset")).toBe("100");
  expect(requests[0].searchParams.get("limit")).toBe("26");
  expect(requests[0].searchParams.get("order")).toBe("starts_at.asc,id.asc");
  expect(requests[0].searchParams.get("shelter_key")).toBe("eq.dog");
  expect(requests[0].searchParams.getAll("starts_at")).toContain("gte.2026-10-19T16:00:00.000Z");
  expect(requests[0].searchParams.getAll("starts_at")).toContain("lt.2026-10-20T16:00:00.000Z");
  expect(requests[0].searchParams.get("or")).toBe(
    "(title.ilike.%Shelter%,location.ilike.%Shelter%)",
  );
});
test("pinned terms reads never repeat the public catalogue or availability queries", async () => {
  const urls: URL[] = [];
  const client = createClient("https://unit-test.invalid", "test-key", {
    auth: { persistSession: false },
    global: {
      fetch: (async (input) => {
        urls.push(new URL(String(input)));
        return Response.json([]);
      }) as typeof fetch,
    },
  });
  await createBookingRepository(client).terms(["00000000-0000-4000-8000-000000000001"]);
  expect(urls.length).toBe(2);
  expect(urls.every((url) => url.pathname.endsWith("volunteer_terms_version"))).toBe(true);
});
