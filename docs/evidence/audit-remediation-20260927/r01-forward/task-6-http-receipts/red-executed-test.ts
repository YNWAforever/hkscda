import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { z } from "zod";
import { createCrmHandlers } from "./http.server";

type Args = Parameters<typeof createCrmHandlers>[0];
const actor = {
  id: "11111111-1111-4111-8111-111111111111",
  authUserId: "11111111-1111-4111-8111-111111111111",
  email: "synthetic@example.invalid",
  role: "treasurer",
  status: "active",
} as const;
const supporterId = "22222222-2222-4222-8222-222222222222";
const logging = spyOn(console, "error").mockImplementation(() => {});
afterEach(() => logging.mockClear());
function handlers(error: unknown, requireTreasurer: Args["requireTreasurer"] = async () => actor) {
  const denied = async () => {
    throw error;
  };
  // These tests invoke only the three actual mutation handlers below.
  const service = {
    createSupporter: denied,
    updateSupporter: denied,
    appendConsents: denied,
  } as unknown as Args["service"];
  return createCrmHandlers({ requireTreasurer, service });
}
function context(update = false) {
  return {
    request: new Request("http://127.0.0.1/crm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        update ? { expectedVersion: 1, name: "Synthetic" } : { source: "admin", email: true },
      ),
    }),
    params: { id: supporterId },
  };
}
describe("R01 CRM actor denial HTTP translation", () => {
  for (const action of ["createSupporter", "updateSupporter", "appendConsents"] as const) {
    test(`${action} returns generic forbidden for transaction actor fence42501`, async () => {
      const response = await handlers({
        code: "42501",
        message: "supporter_edit_forbidden",
        details: "Synthetic private detail",
      })[action](context(action === "updateSupporter"));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Forbidden" });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(logging).not.toHaveBeenCalled();
    });
  }
  test("existing Response denial is passed through", async () => {
    const denial = new Response("Existing denial", { status: 401 });
    const response = await handlers(null, async () => {
      throw denial;
    }).createSupporter(context());
    expect(response).toBe(denial);
  });
  test("Zod validation remains400", async () => {
    const error = z.string().safeParse(1);
    if (error.success) throw new Error("Expected Zod fixture failure");
    const response = await handlers(error.error).createSupporter(context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid CRM request" });
  });
  test("P4090 remains version conflict409", async () => {
    const response = await handlers({ code: "P4090" }).updateSupporter(context(true));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "version_conflict", message: "Supporter changed. Reload before saving." },
    });
  });
  test("unknown SQL failure remains generic500", async () => {
    const response = await handlers({
      code: "XX000",
      message: "Synthetic private detail",
    }).createSupporter(context());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Could not process CRM request" });
    expect(logging).toHaveBeenCalledTimes(1);
  });
});
