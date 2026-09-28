import { expect, test } from "bun:test";
import { createCrmAssignmentAssigneesHandler } from "./assignment-assignees";

const url = "https://example.invalid/api/admin/supporters/assignment-assignees";
test("CRM assignee picker requires current role and returns only validated staff", async () => {
  let listed = 0;
  const handle = createCrmAssignmentAssigneesHandler({
    authorize: async (request) => {
      if (!request.headers.get("authorization"))
        throw new Response("Unauthorized", { status: 401 });
      return "11111111-1111-4111-8111-111111111111";
    },
    list: async () => {
      listed++;
      return [
        {
          authUserId: "22222222-2222-4222-8222-222222222222",
          email: "treasurer@example.invalid",
          role: "treasurer",
        },
      ];
    },
  });
  expect((await handle(new Request(url))).status).toBe(401);
  expect(listed).toBe(0);
  const result = await handle(new Request(url, { headers: { authorization: "Bearer synthetic" } }));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect((await result.json()).assignees).toHaveLength(1);
  expect((await handle(new Request(url, { method: "POST" }))).status).toBe(405);
});
