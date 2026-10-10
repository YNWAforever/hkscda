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

describe("rejecting an internship application needs a reason", () => {
  const review = {
    action: "review",
    application_id: "11111111-2222-4333-8444-555555555555",
    expected_revision: 1,
    idempotency_key: "66666666-7777-4888-8999-000000000000",
    status: "rejected",
    student_verified: false,
    evidence: "",
  };
  function build() {
    const commands: object[] = [];
    const service = createInternshipService({
      command: async (_actor, command) => {
        commands.push(command);
        return { kind: "updated" };
      },
    });
    const http = createInternshipHttp({ service, authenticate: async () => "staff-id" });
    const post = (body: unknown) =>
      http.post(
        new Request("https://example.invalid/api/admin/internships", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        true,
      );
    return { commands, post };
  }

  // required-reason: internship.reject
  test("a rejection reaches the command with the trimmed reason", async () => {
    const { commands, post } = build();
    const response = await post({ ...review, reason: "  not a veterinary student  " });
    expect(response.status).toBe(200);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ status: "rejected", reason: "not a veterinary student" });
  });

  test("a whitespace-only reason is a 400 and never reaches the command", async () => {
    const { commands, post } = build();
    expect((await post({ ...review, reason: "   " })).status).toBe(400);
    expect((await post(review)).status).toBe(400);
    expect(commands).toHaveLength(0);
  });

  test("a reason over 500 characters is a 400 and never reaches the command", async () => {
    const { commands, post } = build();
    expect((await post({ ...review, reason: "x".repeat(501) })).status).toBe(400);
    expect((await post({ ...review, reason: "x".repeat(500) })).status).toBe(200);
    expect(commands).toHaveLength(1);
  });
});
