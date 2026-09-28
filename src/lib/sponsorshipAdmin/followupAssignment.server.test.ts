import { expect, test } from "bun:test";
import {
  createFollowupAssignmentHandler,
  createFollowupAssigneesHandler,
} from "./followupAssignment.server";

const actor = "11111111-1111-4111-8111-111111111111";
const pledge = "22222222-2222-4222-8222-222222222222";
const assignee = "33333333-3333-4333-8333-333333333333";
const request = (body: unknown, method = "POST") =>
  new Request(
    "https://example.invalid/api/admin/sponsorships/pledges/" + pledge + "/followup-assignment",
    {
      method,
      headers: { "content-type": "application/json" },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    },
  );

test("sponsorship follow-up assignment authorizes before any command", async () => {
  let calls = 0;
  const handler = createFollowupAssignmentHandler({
    authorize: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    assign: async () => {
      calls++;
      throw new Error("must not assign");
    },
  });
  const response = await handler(request({ assigneeUserId: assignee, expectedVersion: 1 }), pledge);
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(calls).toBe(0);
});

test("sponsorship follow-up assignment rejects malformed and stale input without mutation", async () => {
  let calls = 0;
  const handler = createFollowupAssignmentHandler({
    authorize: async () => actor,
    assign: async () => {
      calls++;
      throw new Error("must not assign");
    },
  });
  expect(
    (await handler(request({ assigneeUserId: assignee, expectedVersion: 0 }), pledge)).status,
  ).toBe(400);
  expect(
    (await handler(request({ assigneeUserId: "wrong", expectedVersion: 1 }), pledge)).status,
  ).toBe(400);
  expect(
    (await handler(request({ assigneeUserId: assignee, expectedVersion: 1 }), "wrong")).status,
  ).toBe(400);
  expect(calls).toBe(0);
});

test("sponsorship follow-up assignment passes exact actor, pledge, assignee and version", async () => {
  const seen: unknown[] = [];
  const handler = createFollowupAssignmentHandler({
    authorize: async () => actor,
    assign: async (input) => {
      seen.push(input);
      return { pledgeId: pledge, assigneeUserId: assignee, version: 2, replayed: false };
    },
  });
  const response = await handler(request({ assigneeUserId: assignee, expectedVersion: 1 }), pledge);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    pledgeId: pledge,
    assigneeUserId: assignee,
    version: 2,
    replayed: false,
  });
  expect(seen).toEqual([
    { actorUserId: actor, pledgeId: pledge, assigneeUserId: assignee, expectedVersion: 1 },
  ]);
});

test("sponsorship follow-up assignment maps stale version to conflict", async () => {
  const handler = createFollowupAssignmentHandler({
    authorize: async () => actor,
    assign: async () => {
      throw { code: "40001", message: "private record data" };
    },
  });
  const response = await handler(request({ assigneeUserId: assignee, expectedVersion: 1 }), pledge);
  expect(response.status).toBe(409);
  expect(JSON.stringify(await response.json())).not.toContain("private record data");
});

test("follow-up assignee list requires staff authorization and does not reveal data", async () => {
  let called = false;
  const handler = createFollowupAssigneesHandler({
    authorize: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    list: async () => {
      called = true;
      return [];
    },
  });
  const response = await handler(
    new Request("https://example.invalid/api/admin/sponsorships/followup-assignees"),
  );
  expect(response.status).toBe(403);
  expect(called).toBe(false);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("follow-up assignee list returns only validated staff choices", async () => {
  const handler = createFollowupAssigneesHandler({
    authorize: async () => actor,
    list: async () => [{ authUserId: assignee, email: "staff@example.invalid", role: "staff" }],
  });
  const response = await handler(
    new Request("https://example.invalid/api/admin/sponsorships/followup-assignees"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    assignees: [{ authUserId: assignee, email: "staff@example.invalid", role: "staff" }],
  });
});
