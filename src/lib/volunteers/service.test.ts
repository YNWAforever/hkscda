import { describe, expect, test } from "bun:test";

import { createVolunteerService } from "./service";
import type { VolunteerRepository } from "./service";
import type { VolunteerActivityDetail, VolunteerRegistrationDetail } from "./types";

function createRepo(overrides: Partial<VolunteerRepository> = {}) {
  const registrations: unknown[] = [];
  const auditLogs: unknown[] = [];
  const supporterRoles: unknown[] = [];
  const consents: unknown[] = [];
  const repo: VolunteerRepository = {
    listPublishedActivities: async () => [],
    listActivities: async () => ({ activities: [], total: 0 }),
    getActivityForRegistration: async () => activity,
    getActivityDetail: async () => activity,
    createActivity: async () => "activity-new",
    updateActivity: async () => undefined,
    cloneActivity: async () => "activity-clone",
    upsertSupporter: async () => ({ id: "supporter-1", email: "ada@example.com" }),
    ensureSupporterRole: async (input) => {
      supporterRoles.push(input);
    },
    insertConsentRows: async (rows) => {
      consents.push(...rows);
    },
    createRegistration: async (input) => {
      registrations.push(input);
      return { ...registration, ...input, id: "registration-1" } as VolunteerRegistrationDetail;
    },
    listRegistrations: async () => ({ registrations: [], total: 0 }),
    getRegistrationDetail: async () => registration,
    getRegistrationByStatusToken: async () => registration,
    updateRegistrationStatus: async () => registration,
    updateAttendance: async () => registration,
    insertAuditLog: async (row) => {
      auditLogs.push(row);
    },
    ...overrides,
  };
  return { repo, registrations, auditLogs, supporterRoles, consents };
}

const activity: VolunteerActivityDetail = {
  id: "f43d0f00-aa4f-4bb9-856d-6fe2f9f13bd0",
  type: "cleaning_day",
  title: "清潔日",
  description: "清潔貓舍",
  startsAt: "2026-08-01T02:00:00.000Z",
  endsAt: "2026-08-01T05:00:00.000Z",
  location: "荃灣",
  capacity: 12,
  minAge: 16,
  underagePolicy: "allow_with_guardian_pending",
  autoApprove: true,
  allowWaitlist: true,
  status: "published",
  registrationModes: ["individual", "group"],
  approvedParticipants: 4,
  pendingParticipants: 0,
  waitlistedParticipants: 0,
  remainingCapacity: 8,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const registration: VolunteerRegistrationDetail = {
  id: "registration-1",
  activityId: activity.id,
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
  declaredAge: 18,
  youngestAge: null,
  guardianName: null,
  guardianPhone: null,
  notes: null,
  internalNotes: null,
  volunteerHours: null,
  statusToken: "raw-token",
  createdAt: "2026-07-02T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
  activity,
};

describe("volunteer service", () => {
  test("submits a public registration, links a supporter, role, consent, and status token", async () => {
    const { repo, registrations, supporterRoles, consents } = createRepo();
    const service = createVolunteerService({
      repo,
      now: () => new Date("2026-07-02T00:00:00.000Z"),
      createStatusTokenPair: () => ({ rawToken: "raw-token", tokenHash: "hash-token" }),
      appUrl: "https://hkscda.test",
      sendRegistrationEmail: async () => undefined,
      notifyAdmins: async () => undefined,
    });

    const result = await service.submitPublicRegistration({
      activityId: activity.id,
      registrationType: "individual",
      participantCount: 1,
      contact: {
        name: "Ada",
        email: "ADA@example.com",
        phone: "91234567",
        language: "zh-HK",
      },
      declaredAge: 18,
      consents: { email: true, whatsapp: false },
    });

    expect(result).toMatchObject({
      registrationId: "registration-1",
      status: "approved",
      reference: "VOL-REGISTRA",
      statusUrl: "https://hkscda.test/volunteer/status/raw-token",
    });
    expect(supporterRoles).toEqual([{ supporterId: "supporter-1", role: "volunteer" }]);
    expect(consents).toHaveLength(2);
    expect(registrations[0]).toMatchObject({
      supporterId: "supporter-1",
      status: "approved",
      statusReason: "auto_approved",
      statusTokenHash: "hash-token",
    });
  });

  test("does not roll back when volunteer notifications fail", async () => {
    const { repo, registrations } = createRepo();
    const service = createVolunteerService({
      repo,
      now: () => new Date("2026-07-02T00:00:00.000Z"),
      createStatusTokenPair: () => ({ rawToken: "raw-token", tokenHash: "hash-token" }),
      appUrl: "https://hkscda.test",
      sendRegistrationEmail: async () => {
        throw new Error("email down");
      },
      notifyAdmins: async () => {
        throw new Error("admin email down");
      },
      logger: { error: () => undefined },
    });

    await expect(
      service.submitPublicRegistration({
        activityId: activity.id,
        registrationType: "individual",
        participantCount: 1,
        contact: { name: "Ada", email: "ada@example.com", phone: "91234567", language: "zh-HK" },
        declaredAge: 18,
        consents: { email: true },
      }),
    ).resolves.toMatchObject({ status: "approved" });
    expect(registrations).toHaveLength(1);
  });

  test("audits admin registration and attendance changes", async () => {
    const { repo, auditLogs } = createRepo();
    const service = createVolunteerService({
      repo,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    await service.updateRegistrationStatus({
      actorUserId: "admin-user",
      registrationId: "registration-1",
      input: { status: "waitlisted", internalNotes: "Capacity shifted" },
    });
    await service.updateAttendance({
      actorUserId: "admin-user",
      registrationId: "registration-1",
      input: { attendanceStatus: "completed", volunteerHours: 3 },
    });

    expect(auditLogs).toMatchObject([
      {
        actor_user_id: "admin-user",
        action: "volunteer_registration.status_update",
        entity: "volunteer_registration",
        entity_id: "registration-1",
      },
      {
        actor_user_id: "admin-user",
        action: "volunteer_registration.attendance_update",
        entity: "volunteer_registration",
        entity_id: "registration-1",
      },
    ]);
  });
});
