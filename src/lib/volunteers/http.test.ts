import { describe, expect, test } from "bun:test";
import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { createVolunteerHandlers } from "./http.server";

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
    async listPublishedActivities() {
      calls.push("listPublishedActivities");
      return [{ id: "activity-1", title: "清潔日" }];
    },
    async submitPublicRegistration() {
      calls.push("submitPublicRegistration");
      return {
        registrationId: "registration-1",
        reference: "VOL-REGISTRA",
        status: "approved",
        statusUrl: "https://example.test/volunteer/status/raw-token",
      };
    },
    async getPublicRegistrationStatus() {
      calls.push("getPublicRegistrationStatus");
      return { reference: "VOL-REGISTRA", status: "approved" };
    },
    async listActivities() {
      calls.push("listActivities");
      return { activities: [], total: 0 };
    },
    async createActivity() {
      calls.push("createActivity");
      return { id: "activity-new" };
    },
    async updateActivity() {
      calls.push("updateActivity");
      return { ok: true };
    },
    async cloneActivity() {
      calls.push("cloneActivity");
      return { id: "activity-clone" };
    },
    async getActivityDetail() {
      calls.push("getActivityDetail");
      return { id: "activity-1", registrations: [] };
    },
    async listRegistrations() {
      calls.push("listRegistrations");
      return { registrations: [], total: 0 };
    },
    async getRegistrationDetail() {
      calls.push("getRegistrationDetail");
      return { id: "registration-1" };
    },
    async updateRegistrationStatus() {
      calls.push("updateRegistrationStatus");
      return { id: "registration-1", status: "approved" };
    },
    async updateAttendance() {
      calls.push("updateAttendance");
      return { id: "registration-1", attendanceStatus: "completed" };
    },
    ...overrides,
  };
  return service;
}

describe("createVolunteerHandlers", () => {
  test("returns public published activities with no-store cache headers", async () => {
    const service = createService();
    const handlers = createVolunteerHandlers({
      requireVolunteerAdmin: async () => admin,
      service,
    });

    const response = await handlers.listPublishedActivities({
      request: new Request("https://example.test/api/volunteer/activities"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      activities: [{ id: "activity-1", title: "清潔日" }],
    });
  });

  test("maps public registration validation errors to 400", async () => {
    const service = createService({
      async submitPublicRegistration() {
        throw new z.ZodError([]);
      },
    });
    const handlers = createVolunteerHandlers({
      requireVolunteerAdmin: async () => admin,
      service,
    });

    const response = await handlers.submitPublicRegistration({
      request: new Request("https://example.test/api/volunteer/registrations", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid volunteer registration request" });
  });

  test("rejects admin activity requests before service work when auth is missing", async () => {
    const service = createService();
    const handlers = createVolunteerHandlers({
      requireVolunteerAdmin: async () => {
        throw new Response("Missing authorization token", { status: 401 });
      },
      service,
    });

    const response = await handlers.listActivities({
      request: new Request("https://example.test/api/admin/volunteers/activities"),
    });

    expect(response.status).toBe(401);
    expect(service.calls).toEqual([]);
  });

  test("rejects malformed admin JSON bodies before service work", async () => {
    const service = createService();
    const handlers = createVolunteerHandlers({
      requireVolunteerAdmin: async () => admin,
      service,
    });

    const response = await handlers.createActivity({
      request: new Request("https://example.test/api/admin/volunteers/activities", {
        method: "POST",
        body: "{",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(service.calls).toEqual([]);
  });
});
