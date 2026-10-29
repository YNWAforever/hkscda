import { describe, expect, test } from "bun:test";

import {
  createGroupEnquiryService,
  type GroupEnquiryRepository,
} from "../../../../lib/groupEnquiries/service";
import type { GroupEnquiry } from "../../../../lib/groupEnquiries/types";
import { createAdminGroupEnquiryHandlers } from "./group-enquiries";

const admin = {
  id: "admin-1",
  authUserId: "auth-1",
  email: "staff@example.com",
  role: "staff" as const,
  status: "active" as const,
};
// Group enquiry ids are UUIDs; the handler rejects anything else with 400 (BUG-17).
const ENQUIRY_ID = "66666666-6666-4666-8666-666666666666";
const enquiry: GroupEnquiry = {
  id: ENQUIRY_ID,
  organisationName: "Happy School",
  contactPerson: "Ms Chan",
  email: "lead@example.com",
  phone: "91234567",
  activityType: "school_talk",
  otherActivityDescription: null,
  participantCount: 30,
  participantAgeProfile: null,
  preferredDateNotes: null,
  message: null,
  idempotencyKey: "11111111-2222-4333-8444-555555555555",
  status: "new",
  notificationStatus: "failed",
  notificationError: "SMTP down",
  assignedTo: null,
  adminNotes: null,
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};

function request(
  url = "https://example.test/api/admin/volunteers/group-enquiries",
  init: RequestInit = {},
) {
  return new Request(url, { method: "GET", ...init });
}

function createService() {
  const calls: Array<{ name: string; input?: unknown }> = [];
  return {
    calls,
    async listGroupEnquiries(input: unknown) {
      calls.push({ name: "list", input });
      return { enquiries: [], total: 0 };
    },
    async getGroupEnquiry(id: string) {
      calls.push({ name: "get", input: id });
      return { enquiry };
    },
    async updateGroupEnquiry(input: unknown) {
      calls.push({ name: "update", input });
      return { enquiry: { ...enquiry, status: "resolved" as const } };
    },
    async retryGroupEnquiryNotification(input: unknown) {
      calls.push({ name: "retry", input });
      return { ok: true };
    },
  };
}

describe("admin group enquiry handlers", () => {
  test("rejects JSON null before reading update fields", async () => {
    const service = createService();
    const handlers = createAdminGroupEnquiryHandlers({
      requireVolunteerAdmin: async () => admin,
      service,
    });
    const response = await handlers.update({
      request: request(undefined, { method: "PATCH", body: "null" }),
    });
    expect(response.status).toBe(400);
    expect(service.calls).toEqual([]);
  });
  test("requires admin access before service work", async () => {
    const service = createService();
    const handlers = createAdminGroupEnquiryHandlers({
      requireVolunteerAdmin: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
      service,
    });
    const response = await handlers.listOrGet({ request: request() });
    expect(response.status).toBe(403);
    expect(service.calls).toEqual([]);
  });

  test("lists, fetches detail, updates, and retries notifications", async () => {
    const service = createService();
    const handlers = createAdminGroupEnquiryHandlers({
      requireVolunteerAdmin: async () => admin,
      service,
    });

    expect(
      (
        await handlers.listOrGet({
          request: request(
            "https://example.test/api/admin/volunteers/group-enquiries?q=school&pageSize=99",
          ),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await handlers.listOrGet({
          request: request(
            `https://example.test/api/admin/volunteers/group-enquiries?id=${ENQUIRY_ID}`,
          ),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await handlers.update({
          request: request(undefined, {
            method: "PATCH",
            body: JSON.stringify({ id: ENQUIRY_ID, status: "resolved", adminNotes: "done" }),
          }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await handlers.update({
          request: request(undefined, {
            method: "PATCH",
            body: JSON.stringify({ id: ENQUIRY_ID, action: "retryNotification" }),
          }),
        })
      ).status,
    ).toBe(200);

    expect(service.calls.map((call) => call.name)).toEqual(["list", "get", "update", "retry"]);
  });
});

describe("admin group enquiry handlers with the real service — regression", () => {
  // supabase-js returns a plain PostgrestError-shaped object, not an Error instance.
  const pg = (code: string, message: string) => ({ code, message, details: null, hint: null });

  function createRepo() {
    const calls: string[] = [];
    const repo: GroupEnquiryRepository = {
      async createOrGet() {
        calls.push("createOrGet");
        return { enquiry, created: false };
      },
      async markNotificationSent() {
        calls.push("markNotificationSent");
      },
      async markNotificationFailed() {
        calls.push("markNotificationFailed");
      },
      async list() {
        calls.push("list");
        return { enquiries: [], total: 0 };
      },
      async getById(id) {
        calls.push("getById");
        // What Postgres does with a non-uuid id.
        if (!/^[0-9a-f-]{36}$/.test(id))
          throw pg("22P02", `invalid input syntax for type uuid: "${id}"`);
        return null;
      },
      async updateWithAudit() {
        calls.push("updateWithAudit");
        // What the RPC does with an empty patch.
        throw pg("22023", "invalid_group_enquiry_patch");
      },
      async insertAuditLog() {
        calls.push("insertAuditLog");
      },
    };
    return { repo, calls };
  }

  function handlersFor(repo: GroupEnquiryRepository) {
    return createAdminGroupEnquiryHandlers({
      requireVolunteerAdmin: async () => admin,
      service: createGroupEnquiryService({ repo, logger: { error() {} } }),
    });
  }

  async function quietly<T>(run: () => Promise<T>) {
    const original = console.error;
    console.error = () => {};
    try {
      return await run();
    } finally {
      console.error = original;
    }
  }

  test("BUG-17: GET ?id=abc (not a uuid) returns 400, not 500", async () => {
    const { repo } = createRepo();
    const response = await quietly(() =>
      handlersFor(repo).listOrGet({
        request: request("https://example.test/api/admin/volunteers/group-enquiries?id=abc"),
      }),
    );
    expect(response.status).toBe(400);
  });

  test("BUG-17: PATCH with only id and expectedUpdatedAt (no fields) returns 400 before the repository", async () => {
    const { repo, calls } = createRepo();
    const response = await quietly(() =>
      handlersFor(repo).update({
        request: request(undefined, {
          method: "PATCH",
          body: JSON.stringify({
            id: "33333333-3333-4333-8333-333333333333",
            expectedUpdatedAt: "2026-10-29T00:00:00Z",
          }),
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(calls).not.toContain("updateWithAudit");
  });
});
