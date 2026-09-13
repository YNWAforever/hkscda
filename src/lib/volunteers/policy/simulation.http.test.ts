import { expect, test } from "bun:test";
import { createSimulationHandlers } from "./simulation.http.server";
const request = (body: unknown) =>
  new Request("http://localhost/api/admin/volunteers/simulation", {
    method: "POST",
    body: JSON.stringify(body),
  });
test("simulation requires server authorization and rejects actor injection", async () => {
  let calls = 0;
  const execute = async () => {
    calls++;
    return { kind: "listed" };
  };
  const denied = createSimulationHandlers({
    authenticate: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    execute,
  });
  expect((await denied.POST(request({ action: "list" }))).status).toBe(403);
  expect(calls).toBe(0);
  const h = createSimulationHandlers({ authenticate: async () => "verified-admin", execute });
  expect((await h.POST(request({ action: "list", actor: "forged" }))).status).toBe(400);
  expect(calls).toBe(0);
});
test("simulation alone admits an explicit timestamp and reports stale saved draft", async () => {
  let actor = "";
  const h = createSimulationHandlers({
    authenticate: async () => "verified-admin",
    execute: async (id) => {
      actor = id;
      return { kind: "conflict" };
    },
  });
  const response = await h.POST(
    request({
      action: "simulate",
      template_key: "cat-afternoon-chores",
      draft_revision: 1,
      activity_id: "22222222-2222-4222-8222-222222222222",
      profile_id: "33333333-3333-4333-8333-333333333333",
      role: "volunteer",
      simulation_time: "2030-01-01T12:00:00+08:00",
    }),
  );
  expect(response.status).toBe(409);
  expect(actor).toBe("verified-admin");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
