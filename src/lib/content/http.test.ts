import { describe, expect, test } from "bun:test";
import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { createContentHandlers } from "./http.server";
import { ContentValidationError } from "./service";

const admin: AdminUser = {
  id: "admin-row",
  authUserId: "11111111-2222-4333-8444-555555555555",
  email: "staff@example.com",
  role: "staff",
  status: "active",
};

function createService(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const service = {
    calls,
    async listPublicContent() {
      calls.push("listPublicContent");
      return { items: [{ id: "content-1", title: "小白" }], total: 1 };
    },
    async getPublicContentBySlug() {
      calls.push("getPublicContentBySlug");
      return { id: "content-1", slug: "siu-bak", title: "小白" };
    },
    async listPublicMapStories() {
      calls.push("listPublicMapStories");
      return [{ id: "content-1", title: "小白", lat: 22.277, lng: 114.173 }];
    },
    async listAdminContent() {
      calls.push("listAdminContent");
      return { items: [], total: 0 };
    },
    async createContent() {
      calls.push("createContent");
      return { id: "content-1" };
    },
    async getAdminContent() {
      calls.push("getAdminContent");
      return { id: "content-1", title: "小白" };
    },
    async updateContent() {
      calls.push("updateContent");
      return { id: "content-1", title: "小白 updated" };
    },
    async publishContent() {
      calls.push("publishContent");
      return { id: "content-1", status: "published" };
    },
    async archiveContent() {
      calls.push("archiveContent");
      return { id: "content-1", status: "archived" };
    },
    async upsertStoryProfile() {
      calls.push("upsertStoryProfile");
      return { id: "content-1", storyProfile: { rescueRegion: "灣仔" } };
    },
    async createStoryUpdate() {
      calls.push("createStoryUpdate");
      return { id: "update-1" };
    },
    async createContentMedia() {
      calls.push("createContentMedia");
      return { id: "media-1" };
    },
    async createContentLink() {
      calls.push("createContentLink");
      return { id: "link-1" };
    },
    async generateSocialCopy() {
      calls.push("generateSocialCopy");
      return { count: 3 };
    },
    async generateNotificationDrafts() {
      calls.push("generateNotificationDrafts");
      return { count: 2 };
    },
    async updateNotificationDraftStatus() {
      calls.push("updateNotificationDraftStatus");
      return { ok: true };
    },
    async updateSocialCopyStatus() {
      calls.push("updateSocialCopyStatus");
      return { ok: true };
    },
    ...overrides,
  };
  return service;
}

describe("createContentHandlers", () => {
  test("returns public content with no-store cache headers", async () => {
    const service = createService();
    const handlers = createContentHandlers({
      requireContentAdmin: async () => admin,
      service,
    });

    const response = await handlers.listPublicContent({
      request: new Request("https://example.test/api/stories"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      items: [{ id: "content-1", title: "小白" }],
      total: 1,
    });
  });

  test("rejects admin requests before service work when auth is missing", async () => {
    const service = createService();
    const handlers = createContentHandlers({
      requireContentAdmin: async () => {
        throw new Response("Missing authorization token", { status: 401 });
      },
      service,
    });

    const response = await handlers.listAdminContent({
      request: new Request("https://example.test/api/admin/content"),
    });

    expect(response.status).toBe(401);
    expect(service.calls).toEqual([]);
  });

  test("maps publish validation errors to field-level 400 responses", async () => {
    const issues = [
      { field: "coverMediaId", message: "Cover image is required before publishing" },
    ];
    const service = createService({
      async publishContent() {
        throw new ContentValidationError(issues);
      },
    });
    const handlers = createContentHandlers({
      requireContentAdmin: async () => admin,
      service,
    });

    const response = await handlers.publishContent({
      request: new Request(
        "https://example.test/api/admin/content/99999999-aaaa-4333-8444-555555555555/publish",
        {
          method: "POST",
        },
      ),
      params: { id: "99999999-aaaa-4333-8444-555555555555" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Content item cannot be published",
      issues,
    });
  });

  test("maps zod errors to admin 400 responses", async () => {
    const service = createService({
      async createContent() {
        throw new z.ZodError([]);
      },
    });
    const handlers = createContentHandlers({
      requireContentAdmin: async () => admin,
      service,
    });

    const response = await handlers.createContent({
      request: new Request("https://example.test/api/admin/content", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid content management request" });
  });

  test("rejects malformed optional admin JSON bodies before service work", async () => {
    const service = createService();
    const handlers = createContentHandlers({
      requireContentAdmin: async () => admin,
      service,
    });

    const response = await handlers.generateSocialCopy({
      request: new Request(
        "https://example.test/api/admin/content/99999999-aaaa-4333-8444-555555555555/social-copy",
        {
          method: "POST",
          body: "{not-json",
        },
      ),
      params: { id: "99999999-aaaa-4333-8444-555555555555" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(service.calls).toEqual([]);
  });

  test("maps service not-found errors to admin 404 responses", async () => {
    const service = createService({
      async publishContent() {
        throw new Error("Content item not found");
      },
    });
    const handlers = createContentHandlers({
      requireContentAdmin: async () => admin,
      service,
    });

    const response = await handlers.publishContent({
      request: new Request(
        "https://example.test/api/admin/content/99999999-aaaa-4333-8444-555555555555/publish",
        {
          method: "POST",
        },
      ),
      params: { id: "99999999-aaaa-4333-8444-555555555555" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Content item not found" });
  });

  test("maps Supabase single-row misses to admin 404 responses", async () => {
    const service = createService({
      async updateSocialCopyStatus() {
        throw {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
        };
      },
    });
    const handlers = createContentHandlers({
      requireContentAdmin: async () => admin,
      service,
    });

    const response = await handlers.updateSocialCopyStatus({
      request: new Request(
        "https://example.test/api/admin/content/social-copy/99999999-aaaa-4333-8444-555555555555",
        {
          method: "PATCH",
          body: JSON.stringify({ status: "approved" }),
        },
      ),
      params: { id: "99999999-aaaa-4333-8444-555555555555" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Content resource not found" });
  });

  test("routes authoring mutations to content service methods", async () => {
    const service = createService();
    const handlers = createContentHandlers({
      requireContentAdmin: async () => admin,
      service,
    });
    const contentParams = { id: "99999999-aaaa-4333-8444-555555555555" };

    const profileResponse = await handlers.upsertStoryProfile({
      request: new Request(
        "https://example.test/api/admin/content/99999999-aaaa-4333-8444-555555555555/story-profile",
        {
          method: "PUT",
          body: JSON.stringify({
            animalType: "cat",
            publicStatus: "medical_care",
            rescueRegion: "灣仔",
          }),
        },
      ),
      params: contentParams,
    });
    const updateResponse = await handlers.createStoryUpdate({
      request: new Request(
        "https://example.test/api/admin/content/99999999-aaaa-4333-8444-555555555555/updates",
        {
          method: "POST",
          body: JSON.stringify({
            kind: "medical",
            title: "覆診完成",
            occurredAt: "2026-07-05T10:00:00.000Z",
          }),
        },
      ),
      params: contentParams,
    });
    const mediaResponse = await handlers.createContentMedia({
      request: new Request(
        "https://example.test/api/admin/content/99999999-aaaa-4333-8444-555555555555/media",
        {
          method: "POST",
          body: JSON.stringify({
            storagePath: "stories/siu-bak/checkup.jpg",
            altText: "小白覆診照片",
          }),
        },
      ),
      params: contentParams,
    });
    const linkResponse = await handlers.createContentLink({
      request: new Request(
        "https://example.test/api/admin/content/99999999-aaaa-4333-8444-555555555555/links",
        {
          method: "POST",
          body: JSON.stringify({
            linkedType: "adoption_case",
            linkedId: "44444444-4444-4333-8444-555555555555",
            relationship: "adopter",
          }),
        },
      ),
      params: contentParams,
    });

    expect(profileResponse.status).toBe(200);
    expect(updateResponse.status).toBe(201);
    expect(mediaResponse.status).toBe(201);
    expect(linkResponse.status).toBe(201);
    expect(service.calls).toEqual([
      "upsertStoryProfile",
      "createStoryUpdate",
      "createContentMedia",
      "createContentLink",
    ]);
  });
});
