import { describe, expect, test } from "bun:test";
import { createPublicationMetadataHandler } from "./publicationMetadata.server";

const id = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const body = {
  expectedVersion: 4,
  contentClass: "verified",
  sourceReference: "批准記錄 #A1",
  contentOwner: "宣傳主任",
  effectiveFrom: null,
  effectiveUntil: null,
};
function request(values: unknown = body) {
  return new Request(`https://example.test/api/admin/content/${id}/publication-metadata`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(values),
  });
}

describe("publication metadata handler", () => {
  test("checks staff identity before any write and never trusts a body actor", async () => {
    const calls: unknown[] = [];
    const handler = createPublicationMetadataHandler({
      requireAdmin: async () => ({ authUserId: actor }),
      update: async (input) => {
        calls.push(input);
        return { version: 5 };
      },
    });
    const response = await handler(request({ ...body, actorUserId: id }), id);
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
    const valid = await handler(request(), id);
    expect(valid.status).toBe(200);
    expect(calls[0]).toMatchObject({ actorUserId: actor, contentId: id, expectedVersion: 4 });
  });

  test("rejects invalid provenance and stale versions without changing state", async () => {
    let writes = 0;
    const handler = createPublicationMetadataHandler({
      requireAdmin: async () => ({ authUserId: actor }),
      update: async () => {
        writes++;
        throw { code: "40001" };
      },
    });
    expect((await handler(request({ ...body, sourceReference: "" }), id)).status).toBe(400);
    expect(writes).toBe(0);
    expect((await handler(request(), id)).status).toBe(409);
  });

  test("forbidden roles cannot write and unknown DB errors are sanitized", async () => {
    let writes = 0;
    const forbidden = createPublicationMetadataHandler({
      requireAdmin: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
      update: async () => {
        writes++;
        return {};
      },
    });
    expect((await forbidden(request(), id)).status).toBe(403);
    expect(writes).toBe(0);
    const failing = createPublicationMetadataHandler({
      requireAdmin: async () => ({ authUserId: actor }),
      update: async () => {
        throw new Error("private database credential");
      },
    });
    const response = await failing(request(), id);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("credential");
  });
});

describe("CMS-03: publication metadata answers the structured admin error shape", () => {
  function staticHandler(update: () => Promise<unknown>) {
    return createPublicationMetadataHandler({
      requireAdmin: async () => ({ authUserId: actor }),
      update,
    });
  }

  test("CMS-03: verified without a source reference names sourceReference, in both the code and the field", async () => {
    const response = await staticHandler(async () => ({ version: 5 }))(
      request({ ...body, sourceReference: "" }),
      id,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid",
        message: "Invalid publication metadata",
        fields: { sourceReference: ["Required"] },
      },
    });
  });

  test("CMS-03: verified without an owner names contentOwner", async () => {
    const response = await staticHandler(async () => ({ version: 5 }))(
      request({ ...body, contentOwner: "" }),
      id,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid",
        message: "Invalid publication metadata",
        fields: { contentOwner: ["Required"] },
      },
    });
  });

  test("CMS-03: an inverted effective-date range names effectiveUntil", async () => {
    const response = await staticHandler(async () => ({ version: 5 }))(
      request({
        ...body,
        effectiveFrom: "2026-11-10T00:00:00.000Z",
        effectiveUntil: "2026-11-09T00:00:00.000Z",
      }),
      id,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid",
        message: "Invalid publication metadata",
        fields: { effectiveUntil: ["Effective until must be after effective from"] },
      },
    });
  });

  test("CMS-03: a stale expected version is a coded conflict, not a string error", async () => {
    const response = await staticHandler(async () => {
      throw { code: "40001" };
    })(request(), id);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "conflict", message: "Content changed; reload before saving" },
    });
  });

  test("CMS-03: known refusals and unknown failures carry a code the screen can translate", async () => {
    for (const [thrown, status, code] of [
      [{ code: "23514" }, 400, "invalid"],
      [{ code: "22023" }, 400, "invalid"],
      [{ code: "P0002" }, 404, "not_found"],
      [new Error("secret"), 500, "internal"],
    ] as const) {
      const response = await staticHandler(async () => {
        throw thrown;
      })(request(), id);
      expect(response.status).toBe(status);
      const json = (await response.json()) as { error: { code: string } };
      expect(json.error.code).toBe(code);
      expect(JSON.stringify(json)).not.toContain("secret");
    }
  });
});
