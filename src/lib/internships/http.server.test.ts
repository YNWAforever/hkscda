import { expect, test } from "bun:test";
import { createInternshipService, publicCommandSchema } from "./service";
import { createInternshipHttp } from "./http.server";
test("internship public boundary rejects forged actor and reviewer fields", () => {
  expect(publicCommandSchema.safeParse({ action: "mine", actor: "other" }).success).toBe(false);
  expect(publicCommandSchema.safeParse({ action: "review", status: "approved" }).success).toBe(
    false,
  );
});
test("internship auth denial occurs before a command and result conflicts are not successful", async () => {
  let called = false;
  const service = createInternshipService({
    command: async () => {
      called = true;
      return { kind: "conflict" };
    },
  });
  const denied = createInternshipHttp({
    service,
    authenticate: async () => {
      throw new Response(null, { status: 403 });
    },
  });
  expect(
    (
      await denied.post(
        new Request("https://example.invalid", {
          method: "POST",
          body: JSON.stringify({ action: "mine" }),
        }),
      )
    ).status,
  ).toBe(403);
  expect(called).toBe(false);
  const allowed = createInternshipHttp({ service, authenticate: async () => "verified" });
  expect(
    (
      await allowed.post(
        new Request("https://example.invalid", {
          method: "POST",
          body: JSON.stringify({ action: "mine" }),
        }),
      )
    ).status,
  ).toBe(409);
});
