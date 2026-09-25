import { describe, expect, test } from "bun:test";
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

describe("internship command request size", () => {
  test("rejects an oversized JSON request without Content-Length", async () => {
    let called = false;
    const service = createInternshipService({
      command: async () => {
        called = true;
        return { kind: "applications", applications: [] };
      },
    });
    const http = createInternshipHttp({ service, authenticate: async () => "actor-id" });
    const request = new Request("http://localhost/api/internships", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mine", padding: "x".repeat(70 * 1024) }),
    });
    expect(request.headers.get("content-length")).toBeNull();

    const response = await http.post(request);
    expect(response.status).toBe(413);
    expect(called).toBe(false);
  });

  test("accepts a bounded JSON request", async () => {
    let received: unknown;
    const service = createInternshipService({
      command: async (_actor, command) => {
        received = command;
        return { kind: "applications", applications: [] };
      },
    });
    const http = createInternshipHttp({ service, authenticate: async () => "actor-id" });
    const response = await http.post(
      new Request("http://localhost/api/internships", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mine" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(received).toEqual({ action: "mine" });
  });
});
