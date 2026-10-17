import { afterAll, expect, mock, test } from "bun:test";

let entryLoads = 0;

mock.module("@tanstack/react-start/server-entry", () => {
  entryLoads++;
  return {
    default: {
      async fetch() {
        return new Response("ready");
      },
    },
  };
});

afterAll(() => mock.restore());

test("starts loading the TanStack server entry before the first request", async () => {
  const server = (await import("./server")).default;

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(entryLoads).toBe(1);
  const response = await server.fetch(
    new Request("http://127.0.0.1/api/admin/volunteers/tasks", { method: "POST" }),
    {},
    {},
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("ready");
});
