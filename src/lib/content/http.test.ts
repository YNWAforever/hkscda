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
});
