import { expect, test } from "bun:test";
import { createBookingHandlers } from "./booking.http.server";
import { createBookingService } from "./booking";
import { requireVerifiedVolunteer } from "./booking.repository.server";
const id = "00000000-0000-4000-8000-000000000001";
const base = {
  sessions: async () => [],
  terms: async () => [],
  me: async () => ({ profile: null, registrations: [] }),
  claim: async () => ({ kind: "claimed" }),
  command: async () => ({ kind: "booked" }),
};
test("public catalogue never authenticates or reads volunteer profiles", async () => {
  const handlers = createBookingHandlers({
    service: createBookingService({
      ...base,
      me: async () => {
        throw new Error("private read");
      },
    }),
    authenticate: async () => {
      throw new Error("auth not needed");
    },
    verify: async () => true,
  });
  const response = await handlers.get(new Request("https://test.invalid/api/volunteer/policy"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ sessions: [], has_more: false });
});
test("private reads and commands stop before repository when bearer auth fails", async () => {
  let calls = 0;
  const handlers = createBookingHandlers({
    service: createBookingService({
      ...base,
      command: async () => {
        calls++;
        return { kind: "booked" };
      },
    }),
    authenticate: async () => {
      throw new Response("Missing token", { status: 401 });
    },
    verify: async () => true,
  });
  expect((await handlers.get(new Request("https://test.invalid/?view=me"))).status).toBe(401);
  expect(
    (await handlers.post(new Request("https://test.invalid", { method: "POST", body: "{}" })))
      .status,
  ).toBe(401);
  expect(calls).toBe(0);
});
test("authenticated command rejects caller-supplied profile authority", async () => {
  let calls = 0;
  const handlers = createBookingHandlers({
    service: createBookingService({
      ...base,
      command: async () => {
        calls++;
        return { kind: "booked" };
      },
    }),
    authenticate: async () => id,
    verify: async () => true,
  });
  const response = await handlers.post(
    new Request("https://test.invalid", {
      method: "POST",
      body: JSON.stringify({
        command: { action: "availability", activity_id: id, actor: id, tier: "senior" },
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(calls).toBe(0);
});
test("token is verified remotely and unconfirmed email cannot establish identity", async () => {
  const seen: string[] = [];
  const client = {
    auth: {
      getUser: async (token: string) => {
        seen.push(token);
        return { data: { user: { id, email_confirmed_at: null } }, error: null };
      },
    },
  };
  let status = 0;
  try {
    await requireVerifiedVolunteer(
      new Request("https://test.invalid", { headers: { Authorization: "Bearer synthetic" } }),
      client as never,
    );
  } catch (error) {
    status = (error as Response).status;
  }
  expect(status).toBe(403);
  expect(seen).toEqual(["synthetic"]);
});
test("claim cannot inject a tier or another auth user", async () => {
  const handlers = createBookingHandlers({
    service: createBookingService(base),
    authenticate: async () => id,
    verify: async () => true,
  });
  const response = await handlers.post(
    new Request("https://test.invalid", {
      method: "POST",
      body: JSON.stringify({
        command: {
          action: "claim",
          display_name: "Synthetic",
          birth_date: "2000-01-01",
          tier: "senior",
        },
      }),
    }),
  );
  expect(response.status).toBe(400);
});
