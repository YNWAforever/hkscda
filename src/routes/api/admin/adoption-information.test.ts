import { describe, expect, test } from "bun:test";

import { createAdoptionInformationHandlers } from "../../../lib/adoptionInformation/http";
import { AdoptionInformationConflictError } from "../../../lib/adoptionInformation/service";

function setup(options: { unauthorized?: boolean; conflict?: boolean } = {}) {
  const authCalls: string[] = [];
  const service = {
    async listAdmin() {
      return { resource: "fees", items: [], total: 0, page: 1, pageSize: 25 };
    },
    async upsertFee() {
      if (options.conflict) throw new AdoptionInformationConflictError("Fee order conflicts");
      return { id: "fee-1" };
    },
    async upsertEstate() {
      return { id: "estate-1" };
    },
    async deleteEstate() {},
  };
  return {
    authCalls,
    handlers: createAdoptionInformationHandlers({
      async requireAdoptionInformationAdmin(request) {
        authCalls.push(request.method);
        if (options.unauthorized) throw new Response("Unauthorized", { status: 401 });
        return { authUserId: "actor-1" };
      },
      service,
    }),
  };
}

describe("adoption information admin handlers", () => {
  test("requires staff/admin auth and returns no-store request-id JSON", async () => {
    const { authCalls, handlers } = setup();
    const response = await handlers.listAdmin({
      request: new Request("https://example.test/api/admin/adoption-information"),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(authCalls).toEqual(["GET"]);
  });

  test("preserves auth status and maps safe conflicts", async () => {
    const unauthorized = await setup({ unauthorized: true }).handlers.listAdmin({
      request: new Request("https://example.test/api/admin/adoption-information"),
    });
    expect(unauthorized.status).toBe(401);

    const conflict = await setup({ conflict: true }).handlers.upsert({
      request: new Request("https://example.test/api/admin/adoption-information", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "req-1" },
        body: JSON.stringify({
          resource: "fee",
          input: {
            animalType: "dog",
            itemName: "Mongrel 唐狗",
            priceHkd: "0",
            sortOrder: 1,
            isPublished: true,
          },
        }),
      }),
    });
    expect(conflict.status).toBe(409);
    expect(conflict.headers.get("x-request-id")).toBe("req-1");
    expect(await conflict.json()).toEqual({ error: "Fee order conflicts" });
  });
});
