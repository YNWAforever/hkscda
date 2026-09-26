import { expect, test } from "bun:test";
import { createAssessmentHandlers } from "./http.server";

test("volunteer assessment rejects oversized JSON before service work", async () => {
  let calls = 0;
  const handler = createAssessmentHandlers({
    requireActor: async () => ({ authUserId: "admin" }),
    execute: async () => {
      calls += 1;
      return { kind: "saved" } as never;
    },
  }).POST;
  const response = await handler(
    new Request("https://test.invalid/api/admin/volunteers/assessments", {
      method: "POST",
      body: JSON.stringify({ padding: "x".repeat(9 * 1024 * 1024) }),
    }),
  );
  expect(response.status).toBe(413);
  expect(calls).toBe(0);
});

test("volunteer assessment rejects malformed JSON as a client error", async () => {
  const handler = createAssessmentHandlers({
    requireActor: async () => ({ authUserId: "admin" }),
    execute: async () => ({ kind: "saved" }) as never,
  }).POST;
  const response = await handler(
    new Request("https://test.invalid/api/admin/volunteers/assessments", {
      method: "POST",
      body: "{broken",
    }),
  );
  expect(response.status).toBe(400);
});
