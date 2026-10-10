import { expect, test } from "bun:test";
import { z } from "zod";
import { AdoptionInformationConflictError } from "../adoptionInformation/service";
import { createAdoptionInformationHandlers } from "../adoptionInformation/http";

test("generic estate deletion actor refusal maps to safe private 403", async () => {
  const handlers = createAdoptionInformationHandlers({
    requireAdoptionInformationAdmin: async () => ({
      authUserId: "00000000-0000-4000-8000-000000000001",
    }),
    service: {
      deleteEstate: async () => {
        throw { code: "42501", message: "forbidden internal diagnostic" };
      },
    } as never,
  });
  const response = await handlers.deleteEstate({
    request: new Request("https://example.invalid/cms", {
      method: "DELETE",
      headers: { "content-type": "application/json", "x-request-id": "synthetic-request-id" },
      body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000002", reason: "closed" }),
    }),
  });
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-request-id")).toBe("synthetic-request-id");
  expect(await response.json()).toEqual({ error: "Forbidden" });
});

const invalid = z.string().uuid().safeParse("invalid");
if (invalid.success) throw new Error("Expected fixture validation failure");
for (const [name, error, status] of [
  ["Response", new Response("Unauthorized", { status: 401 }), 401],
  ["Zod", invalid.error, 400],
  ["conflict", new AdoptionInformationConflictError("Synthetic conflict"), 409],
  ["missing", { code: "P0002", message: "internal diagnostic" }, 404],
  ["unknown", { code: "XX000", message: "internal diagnostic" }, 500],
  ["non-object", "42501", 500],
] as const)
  test(`estate permission mapping preserves ${name}`, async () => {
    const handlers = createAdoptionInformationHandlers({
      requireAdoptionInformationAdmin: async () => ({
        authUserId: "00000000-0000-4000-8000-000000000001",
      }),
      service: {
        deleteEstate: async () => {
          throw error;
        },
      } as never,
    });
    const response = await handlers.deleteEstate({
      request: new Request("https://example.invalid/cms", {
        method: "DELETE",
        headers: { "content-type": "application/json", "x-request-id": "synthetic-request-id" },
        body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000002", reason: "closed" }),
      }),
    });
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("synthetic-request-id");
  });
