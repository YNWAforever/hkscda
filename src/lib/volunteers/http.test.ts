import { describe, expect, test } from "bun:test";
import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { createVolunteerHandlers } from "./http.server";
import { createVolunteerService } from "./service";
import type { VolunteerActivitySummary, VolunteerRegistrationDetail } from "./types";

const admin: AdminUser = {
  id: "admin-row",
  authUserId: "11111111-2222-4333-8444-555555555555",
  email: "staff@example.com",
  role: "staff",
  status: "active",
};

const publishedActivity: VolunteerActivitySummary = {
  id: "activity-1",
  type: "cleaning_day",
  title: "\u6e05\u6f54\u65e5",
  description: null,
  startsAt: "2026-08-01T02:00:00.000Z",
  endsAt: "2026-08-01T05:00:00.000Z",
  location: "Hong Kong",
  capacity: 12,
  approvedParticipants: 4,
  pendingParticipants: 0,
  waitlistedParticipants: 0,
  remainingCapacity: 8,
  allowWaitlist: true,
  autoApprove: true,
  minAge: 16,
  underagePolicy: "allow_with_guardian_pending",
  registrationModes: ["individual", "group"],
  status: "published",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const registration: VolunteerRegistrationDetail = {
  id: "registration-1",
  activityId: publishedActivity.id,
  supporterId: "supporter-1",
  registrationType: "individual",
  status: "approved",
  statusReason: "auto_approved",
  attendanceStatus: "not_marked",
  participantCount: 1,
  contactName: "Ada",
  contactEmail: "ada@example.com",
  contactPhone: "91234567",
  language: "zh-HK",
  organizationName: null,
  declaredAge: 21,
  youngestAge: null,
  guardianName: null,
  guardianPhone: null,
  notes: null,
  internalNotes: null,
  volunteerHours: null,
  statusToken: "raw-token",
  createdAt: "2026-07-02T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
  activity: publishedActivity,
};

type VolunteerHandlerService = ReturnType<typeof createVolunteerService>;
function createService(overrides: Partial<VolunteerHandlerService> = {}) {
  const calls: string[] = [];
  const service: VolunteerHandlerService & { calls: string[] } = {
    calls,
    async listPublishedActivities() {
      calls.push("listPublishedActivities");
      return [publishedActivity];
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
      return {
        reference: "VOL-REGISTRA",
        status: "approved",
        attendanceStatus: "not_marked",
        participantCount: 1,
        activityTitle: publishedActivity.title,
        startsAt: publishedActivity.startsAt,
        location: publishedActivity.location,
      };
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
      return publishedActivity;
    },
    async listRegistrations() {
      calls.push("listRegistrations");
      return { registrations: [], total: 0 };
    },
    async getRegistrationDetail() {
      calls.push("getRegistrationDetail");
      return registration;
    },
    async updateRegistrationStatus() {
      calls.push("updateRegistrationStatus");
      return registration;
    },
    async updateAttendance() {
      calls.push("updateAttendance");
      return registration;
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
      activities: [publishedActivity],
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
