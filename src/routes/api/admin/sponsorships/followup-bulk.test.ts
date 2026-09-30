import { expect, test } from "bun:test";
import {
  createSponsorshipFollowupBulkHandler,
  type SponsorshipFollowupBulkOperation,
} from "./followup-bulk";

const url = "https://example.invalid/api/admin/sponsorships/followup-bulk";
const actor = "11111111-1111-4111-8111-111111111111";
const assignee = "22222222-2222-4222-8222-222222222222";
const op = "33333333-3333-4333-8333-333333333333";
const ids = Array.from(
  { length: 30 },
  (_, index) => `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`,
);

test("sponsorship bulk API denies unauthenticated and invalid previews before writes", async () => {
  const calls: string[] = [];
  const operation: SponsorshipFollowupBulkOperation = {
    operationId: op,
    assigneeUserId: assignee,
    filterHash: "a".repeat(64),
    createdAt: "2026-09-28",
    expiresAt: "2099-09-28",
    state: "queued",
    items: [],
  };
  const handle = createSponsorshipFollowupBulkHandler({
    authorize: async (request) => {
      if (!request.headers.get("authorization"))
        throw new Response("Unauthorized", { status: 401 });
      return actor;
    },
    preview: async () => {
      calls.push("preview");
      return operation;
    },
    read: async () => operation,
    applyItem: async () => undefined,
  });
  const post = (selected: string[], authenticated = true) =>
    handle(
      new Request(url, {
        method: "POST",
        headers: authenticated ? { authorization: "Bearer synthetic" } : {},
        body: JSON.stringify({
          action: "preview",
          ids: selected,
          assigneeUserId: assignee,
          filterHash: "a".repeat(64),
        }),
      }),
    );
  expect((await post([ids[0]!], false)).status).toBe(401);
  expect((await post(Array.from({ length: 1001 }, () => ids[0]!))).status).toBe(400);
  expect((await post([ids[0]!, ids[0]!])).status).toBe(400);
  expect(calls).toEqual([]);
  const result = await post([ids[0]!]);
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(calls).toEqual(["preview"]);
});

test("sponsorship bulk API applies 25 at a time and resumes from durable item states", async () => {
  const state = new Map(ids.map((id) => [id, "pending" as "pending" | "succeeded"]));
  const calls: string[] = [];
  const operation = (): SponsorshipFollowupBulkOperation => ({
    operationId: op,
    assigneeUserId: assignee,
    filterHash: "a".repeat(64),
    createdAt: "2026-09-28",
    expiresAt: "2099-09-28",
    state: "partial",
    items: ids.map((id) => ({
      entityId: id,
      status: state.get(id)!,
      reasonCode: null,
      beforeAssignee: null,
      afterAssignee: assignee,
      expectedVersion: 1,
    })),
  });
  let interrupt = true;
  const handle = createSponsorshipFollowupBulkHandler({
    authorize: async () => actor,
    preview: async () => operation(),
    read: async () => operation(),
    applyItem: async (_actor, _operation, id) => {
      if (interrupt && calls.length === 10) throw new Error("synthetic interruption");
      calls.push(id);
      state.set(id, "succeeded");
    },
  });
  const apply = () =>
    handle(
      new Request(url, {
        method: "POST",
        body: JSON.stringify({ action: "apply", operationId: op }),
      }),
    );
  expect((await apply()).status).toBe(503);
  expect(calls).toHaveLength(10);
  interrupt = false;
  expect((await apply()).status).toBe(200);
  expect(calls).toHaveLength(30);
  expect((await apply()).status).toBe(200);
  expect(calls).toHaveLength(30);
});

test("malformed JSON is a no-store 400 before any bulk mutation", async () => {
  let writes = 0;
  const handle = createSponsorshipFollowupBulkHandler({
    authorize: async () => actor,
    preview: async () => {
      writes++;
      throw Error("unexpected");
    },
    read: async () => {
      throw Error("unexpected");
    },
    applyItem: async () => {
      writes++;
    },
  });
  const response = await handle(new Request(url, { method: "POST", body: "{" }));
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(writes).toBe(0);
});
