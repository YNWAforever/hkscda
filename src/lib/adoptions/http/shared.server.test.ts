import { expect, test } from "bun:test";
import { jsonResponse, queryParams, requiredUuid, withErrors } from "./shared.server";

test("shared JSON responses retain headers and force no-store", async () => {
  const response = jsonResponse(
    { ok: true },
    {
      status: 201,
      headers: { "x-test": "preserved" },
    },
  );
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-test")).toBe("preserved");
});

test("invalid UUID responses retain validation-before-auth semantics", async () => {
  const response = await withErrors(async () => {
    requiredUuid({ id: "bad" }, "id");
    return jsonResponse({ unreachable: true });
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid id" });
});

test("queryParams returns decoded plain values", () => {
  expect(queryParams(new Request("https://x.test/?page=2&q=ginger%20cat"))).toEqual({
    page: "2",
    q: "ginger cat",
  });
});
