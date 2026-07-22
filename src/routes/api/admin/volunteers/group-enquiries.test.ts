import { describe, expect, test } from "bun:test";

import { createAdminGroupEnquiryHandlers } from "./group-enquiries";

const admin = { id: "admin-1", authUserId: "auth-1", email: "staff@example.com", role: "staff" as const, status: "active" as const };

function request(url = "https://example.test/api/admin/volunteers/group-enquiries", init: RequestInit = {}) {
  return new Request(url, { method: "GET", ...init });
}

function createService() {
  const calls: Array<{ name: string; input?: unknown }> = [];
  return {
    calls,
    async listGroupEnquiries(input: unknown) { calls.push({ name: "list", input }); return { enquiries: [], total: 0 }; },
    async getGroupEnquiry(id: string) { calls.push({ name: "get", input: id }); return { enquiry: { id } }; },
    async updateGroupEnquiry(input: unknown) { calls.push({ name: "update", input }); return { id: "enquiry-1", status: "resolved" }; },
    async retryGroupEnquiryNotification(input: unknown) { calls.push({ name: "retry", input }); return { ok: true }; },
  };
}

describe("admin group enquiry handlers", () => {
  test("requires admin access before service work", async () => {
    const service = createService();
    const handlers = createAdminGroupEnquiryHandlers({
      requireVolunteerAdmin: async () => { throw new Response("Forbidden", { status: 403 }); },
      service,
    });
    const response = await handlers.listOrGet({ request: request() });
    expect(response.status).toBe(403);
    expect(service.calls).toEqual([]);
  });

  test("lists, fetches detail, updates, and retries notifications", async () => {
    const service = createService();
    const handlers = createAdminGroupEnquiryHandlers({ requireVolunteerAdmin: async () => admin, service });

    expect((await handlers.listOrGet({ request: request("https://example.test/api/admin/volunteers/group-enquiries?q=school&pageSize=99") })).status).toBe(200);
    expect((await handlers.listOrGet({ request: request("https://example.test/api/admin/volunteers/group-enquiries?id=enquiry-1") })).status).toBe(200);
    expect((await handlers.update({ request: request(undefined, { method: "PATCH", body: JSON.stringify({ id: "enquiry-1", status: "resolved", adminNotes: "done" }) }) })).status).toBe(200);
    expect((await handlers.update({ request: request(undefined, { method: "PATCH", body: JSON.stringify({ id: "enquiry-1", action: "retryNotification" }) }) })).status).toBe(200);

    expect(service.calls.map((call) => call.name)).toEqual(["list", "get", "update", "retry"]);
  });
});
