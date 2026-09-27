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
