import { expect, test } from "bun:test";
import { createCrmAssignmentBulkHandler } from "./assignment-bulk";

const url = "https://example.invalid/api/admin/supporters/assignment-bulk";
const actor = "11111111-1111-4111-8111-111111111111";
const assignee = "22222222-2222-4222-8222-222222222222";
const op = "33333333-3333-4333-8333-333333333333";
const ids = Array.from(
  { length: 30 },
  (_, index) => `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`,
);

test("CRM assignment route authorizes before reading data and rejects invalid snapshots", async () => {
  const seen: string[] = [];
  const handle = createCrmAssignmentBulkHandler({
    authorize: async (request) => {
      if (!request.headers.get("authorization"))
        throw new Response("Unauthorized", { status: 401 });
      return actor;
    },
    preview: async () => {
      seen.push("preview");
      throw new Error("unexpected");
    },
    read: async () => {
      seen.push("read");
      throw new Error("unexpected");
    },
    applyItem: async () => {
      seen.push("apply");
      throw new Error("unexpected");
    },
  });
  const command = (body: unknown, authenticated = true) =>
    handle(
      new Request(url, {
        method: "POST",
        headers: authenticated ? { authorization: "Bearer synthetic" } : {},
        body: JSON.stringify(body),
      }),
    );
  const base = {
    action: "preview",
    ids: [ids[0]],
    assigneeUserId: assignee,
    filterHash: "a".repeat(64),
  };
  expect((await command(base, false)).status).toBe(401);
  expect((await command({ ...base, ids: Array.from({ length: 1001 }, () => ids[0]) })).status).toBe(
    400,
  );
  expect((await command({ ...base, ids: [ids[0], ids[0]] })).status).toBe(400);
  expect((await command({ ...base, assigneeUserId: "bad" })).status).toBe(400);
  expect((await command({ ...base, filterHash: "bad" })).status).toBe(400);
  expect(
    (
      await handle(
        new Request(url + "?operationId=bad", { headers: { authorization: "Bearer synthetic" } }),
      )
    ).status,
  ).toBe(400);
  expect(seen).toEqual([]);
});

test("CRM assignment apply checkpoints 25 rows, recovers and never replays completed items", async () => {
  const state = new Map(ids.map((id) => [id, "pending" as "pending" | "succeeded"]));
  const applied: string[] = [];
  const operation = () => ({
    operationId: op,
    assigneeUserId: assignee,
    filterHash: "a".repeat(64),
    createdAt: "2026-09-28",
    expiresAt: "2099-09-28",
    state: "partial" as const,
    items: ids.map((id) => ({
      entityId: id,
      status: state.get(id)!,
      reasonCode: null,
      expectedVersion: 1,
      beforeAssignee: null,
      afterAssignee: assignee,
    })),
  });
  const handle = createCrmAssignmentBulkHandler({
    authorize: async () => actor,
    preview: async () => operation(),
    read: async () => operation(),
    applyItem: async (_actor, _op, id) => {
      applied.push(id);
      state.set(id, "succeeded");
      return { entityId: id, status: "succeeded" as const, reasonCode: null };
    },
  });
  const call = () =>
    handle(
      new Request(url, {
        method: "POST",
        body: JSON.stringify({ action: "apply", operationId: op }),
      }),
    );
  let result = await call();
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(applied).toHaveLength(25);
  result = await handle(new Request(url + "?operationId=" + op));
  expect(result.status).toBe(200);
  expect((await result.json()).items).toHaveLength(30);
  await call();
  await call();
  expect(applied).toHaveLength(30);
});
