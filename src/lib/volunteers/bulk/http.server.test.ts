import { expect, test } from "bun:test";
import { createBulkHandlers } from "./http.server";
test("bulk auth failures remain private no-store responses", async () => {
  const handlers = createBulkHandlers({
    requireActor: async () => {
      throw new Response("Unauthorized", { status: 401 });
    },
    execute: async () => {
      throw Error("Must not execute");
    },
  });
  const response = await handlers.POST(
    new Request("http://fixture.invalid/api/admin/volunteers/bulk", {
      method: "POST",
      body: JSON.stringify({ action: "templates" }),
    }),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
