import { expect, test } from "bun:test";
import { createTaskOverviewHandler } from "./task-overview";

test("task overview API enforces active admin role and hides other roles' metrics", async () => {
  const seen: string[] = [];
  const handle = createTaskOverviewHandler({
    authorize: async (request) => {
      const token = request.headers.get("authorization");
      if (!token) throw new Response("Unauthorized", { status: 401 });
      if (token !== "Bearer treasurer") throw new Response("Forbidden", { status: 403 });
      return "treasurer";
    },
    repository: {
      count: async (key) => {
        seen.push(key);
        return { count: 1, oldestAt: null };
      },
    },
  });
  const missing = await handle(new Request("https://example.invalid/api/admin/task-overview"));
  expect(missing.status).toBe(401);
  const permitted = await handle(
    new Request("https://example.invalid/api/admin/task-overview", {
      headers: { authorization: "Bearer treasurer" },
    }),
  );
  expect(permitted.status).toBe(200);
  expect(permitted.headers.get("cache-control")).toBe("no-store");
  expect(seen).not.toContain("adoption_unassigned");
  expect((await permitted.json()).cards).toHaveLength(4);
});
