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
    listAdmin: async () => ({
      about: null,
      tnr: null,
      cccp: null,
      revisions: { about: null, tnr: null, cccp: null },
    }),
    upsertAdmin: mock(async () => ({ content: validTnr, revision: 1 })),
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
      listAdmin: (async () => {
        throw new Error("db exploded");
      }) as never,
    });
    const requireAboutPagesAdmin = mock(async () => admin);
    const handlers = createAdminAboutPagesHandlers({ requireAboutPagesAdmin, service });
    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(response.status).toBe(500);
  });
});

describe("about pages revision fence", () => {
  test("list returns the pages with the revisions the editor saves against", async () => {
    const adminPages = {
      about: null,
      tnr: validTnr as never,
      cccp: null,
      revisions: { about: 4, tnr: 7, cccp: null },
    };
    const service = createService({ listAdmin: (async () => adminPages) as never });
    const handlers = createAdminAboutPagesHandlers({
      requireAboutPagesAdmin: async () => admin,
      service,
    });

    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(adminPages);
  });

  test("passes expectedRevision and answers a stale one with the coded 409", async () => {
    const upsertAdmin = mock(async (input: { expectedRevision?: number }) => {
      if (input.expectedRevision === 2) throw { code: "40001" };
      return { content: validTnr, revision: 8 };
    });
    const handlers = createAdminAboutPagesHandlers({
      requireAboutPagesAdmin: async () => admin,
      service: createService({ upsertAdmin: upsertAdmin as never }),
    });

    const fresh = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "PUT",
        body: JSON.stringify({ pageSlug: "tnr", expectedRevision: 7, content: validTnr }),
      }),
    });
    expect(fresh.status).toBe(200);
    expect(await fresh.json()).toEqual({
      pageSlug: "tnr",
      content: validTnr,
      revision: 8,
    });
    expect(upsertAdmin.mock.calls[0]?.[0]).toMatchObject({ expectedRevision: 7 });

    const stale = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "PUT",
        body: JSON.stringify({ pageSlug: "tnr", expectedRevision: 2, content: validTnr }),
      }),
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({
      error: { code: "conflict", message: "About page changed; reload before saving" },
    });
  });
});
