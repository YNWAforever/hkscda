import { describe, expect, mock, test } from "bun:test";

import { createAdminAboutPagesHandlers } from "./http.server";
import type { createAboutPagesService } from "./service";

const adminUserId = "11111111-1111-4111-8111-111111111111";
const authUserId = "22222222-2222-4222-8222-222222222222";
const admin = { id: adminUserId, authUserId, role: "admin" } as never;

const validTnr = {
  hero: { eyebrow: "e", title: "t", description: "d" },
  stages: [
    { title: "1", description: "d" },
    { title: "2", description: "d" },
    { title: "3", description: "d" },
  ],
  chapter: { title: "t", description: "d", bullets: ["1", "2", "3"] },
  cta: { eyebrow: "e", title: "t", descriptionPrefix: "p" },
};

function createService(overrides: Partial<ReturnType<typeof createAboutPagesService>> = {}) {
  return {
    listPublic: mock(async () => ({ about: null, tnr: null, cccp: null })),
    upsertAdmin: mock(async () => validTnr),
    ...overrides,
  } as unknown as ReturnType<typeof createAboutPagesService>;
}

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("createAdminAboutPagesHandlers", () => {
  test("list requires an admin and returns the service's data with no-store", async () => {
    const service = createService();
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });

    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(requireAboutPagesAdmin).toHaveBeenCalledTimes(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.status).toBe(200);
  });

  test("list propagates a Response thrown by requireAboutPagesAdmin", async () => {
    const service = createService();
    const requireAboutPagesAdmin = mock(async () => {
      throw new Response("Forbidden", { status: 403 });
    });
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });
    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(response.status).toBe(403);
  });

  test("upsert calls service.upsertAdmin with the actor's authUserId, not id", async () => {
    const service = createService();
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });

    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "PUT",
        body: JSON.stringify({ pageSlug: "tnr", content: validTnr }),
      }),
    });

    expect(response.status).toBe(200);
    expect(service.upsertAdmin).toHaveBeenCalledWith({
      actorUserId: authUserId,
      pageSlug: "tnr",
      content: validTnr,
    });
  });

  test("upsert returns 400 on invalid JSON", async () => {
    const service = createService();
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });
    const response = await handlers.upsert({
      request: request("http://localhost/x", { method: "PUT", body: "not json" }),
    });
    expect(response.status).toBe(400);
  });

  test("upsert returns 400 with issue details on a zod validation error", async () => {
    const service = createService({
      upsertAdmin: mock(async () => {
        const { z } = await import("zod");
        throw new z.ZodError([
          { code: "custom", path: ["hero", "title"], message: "Required" } as never,
        ]);
      }),
    });
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "PUT",
        body: JSON.stringify({ pageSlug: "tnr", content: validTnr }),
      }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.issues[0].path).toBe("hero.title");
  });

  test("upsert returns 400 when pageSlug is unknown", async () => {
    const service = createService();
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });
    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "PUT",
        body: JSON.stringify({ pageSlug: "team", content: validTnr }),
      }),
    });
    expect(response.status).toBe(400);
  });

  test("an unexpected error falls through to a generic 500", async () => {
    const service = createService({
      listPublic: mock(async () => {
        throw new Error("db exploded");
      }),
    });
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });
    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(response.status).toBe(500);
  });
});
