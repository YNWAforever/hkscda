import { expect, test } from "bun:test";
import { createContentHandlers } from "./http.server";
import { ContentLifecycleError } from "./lifecycle";
import { ContentValidationError } from "./service";
import { z } from "zod";

test("CMS actor permission refusal maps to safe private 403", async () => {
  const handlers = createContentHandlers({
    requireContentAdmin: async () =>
      ({ authUserId: "00000000-0000-4000-8000-000000000001" }) as never,
    service: {
      generateNotificationDrafts: async () => {
        throw { code: "42501", message: "forbidden internal diagnostic" };
      },
    } as never,
  });
  const response = await handlers.generateNotificationDrafts({
    request: new Request("https://example.invalid/cms", { method: "POST" }),
    params: { updateId: "00000000-0000-4000-8000-000000000002" },
  });
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(JSON.stringify(await response.json())).not.toContain("internal diagnostic");
});

const invalid = z.string().uuid().safeParse("invalid");
if (invalid.success) throw new Error("Expected fixture validation failure");
for (const [name, error, status] of [
  ["Response", new Response("Unauthorized", { status: 401 }), 401],
  ["lifecycle conflict", new ContentLifecycleError("conflict", "Synthetic conflict"), 409],
  ["Zod", invalid.error, 400],
  [
    "publication validation",
    new ContentValidationError([{ field: "title", message: "Synthetic invalid" }]),
    400,
  ],
  ["unknown SQLSTATE", { code: "XX000", message: "internal diagnostic" }, 500],
  ["raw version code", { code: "P4090", message: "internal diagnostic" }, 500],
  ["non-object matching text", "42501", 500],
] as const)
  test(`CMS permission mapping preserves ${name}`, async () => {
    const handlers = createContentHandlers({
      requireContentAdmin: async () =>
        ({ authUserId: "00000000-0000-4000-8000-000000000001" }) as never,
      service: {
        generateNotificationDrafts: async () => {
          throw error;
        },
      } as never,
    });
    const response = await handlers.generateNotificationDrafts({
      request: new Request("https://example.invalid/cms", { method: "POST" }),
      params: { updateId: "00000000-0000-4000-8000-000000000002" },
    });
    expect(response.status).toBe(status);
    if (!(error instanceof Response))
      expect(response.headers.get("cache-control")).toBe("no-store");
  });
test("CMS permission mapping preserves public request500", async () => {
  const handlers = createContentHandlers({
    requireContentAdmin: async () => {
      throw new Error("Unused auth");
    },
    service: {
      listPublicContent: async () => {
        throw { code: "42501", message: "internal diagnostic" };
      },
    } as never,
  });
  const response = await handlers.listPublicContent({
    request: new Request("https://example.invalid/public"),
  });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Could not load story content" });
});
