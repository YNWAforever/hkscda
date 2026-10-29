import { describe, expect, test } from "bun:test";

import { createVolunteerHandlers } from "./http.server";
import { createVolunteerService } from "./service";
import type { VolunteerRepository } from "./service";
import type { VolunteerActivityDetail, VolunteerRegistrationDetail } from "./types";

function createRepo(overrides: Partial<VolunteerRepository> = {}) {
  const registrations: unknown[] = [];
  const auditLogs: unknown[] = [];
  const supporterRoles: unknown[] = [];
  const consents: unknown[] = [];
  const resolvedContacts: unknown[] = [];
  const repo: VolunteerRepository = {
    listPublishedActivities: async () => [],
    listActivities: async () => ({ activities: [], total: 0 }),
    getActivityForRegistration: async () => activity,
    getActivityDetail: async () => activity,
    createActivity: async () => "activity-new",
    updateActivity: async () => undefined,
    cloneActivity: async () => "activity-clone",
    resolvePublicIdentity: async (contact) => {
      resolvedContacts.push(contact);
      return { supporterId: "supporter-1", kind: "existing" };
    },
    ensureSupporterRole: async (input) => {
      supporterRoles.push(input);
    },
    insertConsentRows: async (rows) => {
      consents.push(...rows);
    },
    createRegistration: async (input) => {
      registrations.push(input);
      return {
        registration: {
          ...registration,
          ...input,
          id: "registration-1",
        } as VolunteerRegistrationDetail,
        created: true,
      };
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
  return { repo, registrations, auditLogs, supporterRoles, consents, resolvedContacts };
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
  activity,
};

describe("volunteer service", () => {
  test("submits a public registration, links a supporter, role, consent, and status token", async () => {
    const { repo, registrations, supporterRoles, consents, resolvedContacts } = createRepo();
    const service = createVolunteerService({
      repo,
      now: () => new Date("2026-07-02T00:00:00.000Z"),
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
      declaredAge: 21,
      consents: { email: true, whatsapp: false },
      submissionToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });

    expect(result).toMatchObject({
      registrationId: "registration-1",
      status: "approved",
      reference: "VOL-REGISTRA",
      statusUrl: "https://hkscda.test/volunteer/status/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
    expect(supporterRoles).toEqual([{ supporterId: "supporter-1", role: "volunteer" }]);
    expect(resolvedContacts).toEqual([
      {
        name: "Ada",
        email: "ada@example.com",
        phone: "91234567",
        language: "zh-HK",
        source: "volunteer_registration_form",
      },
    ]);
    expect(consents).toEqual([expect.objectContaining({ channel: "whatsapp", status: "opt_out" })]);
    expect(registrations[0]).toMatchObject({
      supporterId: "supporter-1",
      status: "approved",
      statusReason: "auto_approved",
      statusTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      consentEmailRequested: true,
      consentWhatsappRequested: false,
    });
  });

  test("does not roll back when volunteer notifications fail", async () => {
    const { repo, registrations } = createRepo();
    const service = createVolunteerService({
      repo,
      now: () => new Date("2026-07-02T00:00:00.000Z"),
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
        declaredAge: 21,
        consents: { email: true },
        submissionToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      }),
    ).resolves.toMatchObject({ status: "approved" });
    expect(registrations).toHaveLength(1);
  });

  test("delegates status and attendance audit atomically", async () => {
    const { repo, auditLogs } = createRepo();
    const service = createVolunteerService({
      repo,
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    await service.updateRegistrationStatus({
      actorUserId: "admin-user",
      registrationId: "registration-1",
      input: {
        status: "waitlisted",
        internalNotes: "Capacity shifted",
        expectedUpdatedAt: "2026-07-03T00:00:00.000Z",
      },
    });
    await service.updateAttendance({
      actorUserId: "admin-user",
      registrationId: "registration-1",
      input: {
        attendanceStatus: "completed",
        volunteerHours: 3,
        expectedUpdatedAt: registration.updatedAt,
      },
    });

    expect(auditLogs).toEqual([]);
  });
  test("rejects public individual registrations below the public age floor", async () => {
    const { repo, registrations } = createRepo();
    const service = createVolunteerService({ repo });

    await expect(
      service.submitPublicRegistration({
        activityId: activity.id,
        registrationType: "individual",
        participantCount: 1,
        contact: { name: "Ada", email: "ada@example.com", phone: "91234567", language: "zh-HK" },
        declaredAge: 20,
        consents: { email: true },
        submissionToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      }),
    ).rejects.toThrow(/21/);
    expect(registrations).toHaveLength(0);
  });
});

test("staff status command carries actor and version into one repository mutation", async () => {
  const commands: unknown[] = [];
  const { repo, auditLogs } = createRepo({
    updateRegistrationStatus: async (command) => {
      commands.push(command);
      return registration;
    },
  });
  await createVolunteerService({ repo }).updateRegistrationStatus({
    actorUserId: "actor-1",
    registrationId: registration.id,
    input: {
      status: "approved",
      expectedUpdatedAt: registration.updatedAt,
      internalNotes: "Reviewed",
    },
  });
  expect(commands).toEqual([
    {
      registrationId: registration.id,
      actorUserId: "actor-1",
      expectedUpdatedAt: registration.updatedAt,
      status: "approved",
      internalNotes: "Reviewed",
      reason: null,
    },
  ]);
  expect(auditLogs).toEqual([]);
});

test("attendance requires an expected version and correction reason", async () => {
  const { repo } = createRepo();
  const service = createVolunteerService({ repo });
  await expect(
    service.updateAttendance({
      actorUserId: "actor",
      registrationId: registration.id,
      input: { attendanceStatus: "completed" },
    }),
  ).rejects.toThrow();
  await expect(
    service.updateAttendance({
      actorUserId: "actor",
      registrationId: registration.id,
      input: {
        attendanceStatus: "no_show",
        expectedUpdatedAt: registration.updatedAt,
        command: "correct",
        reason: " ",
      },
    }),
  ).rejects.toThrow();
});

test("attendance sends actor and version to atomic repository without separate read or audit", async () => {
  const commands: unknown[] = [];
  const { repo, auditLogs } = createRepo({
    getRegistrationDetail: async () => {
      throw new Error("unsafe pre-read");
    },
    updateAttendance: async (command) => {
      commands.push(command);
      return registration;
    },
  });
  await createVolunteerService({ repo }).updateAttendance({
    actorUserId: "actor",
    registrationId: registration.id,
    input: { attendanceStatus: "completed", expectedUpdatedAt: registration.updatedAt },
  });
  expect(commands[0]).toMatchObject({
    actorUserId: "actor",
    expectedUpdatedAt: registration.updatedAt,
    command: "record",
  });
  expect(auditLogs).toEqual([]);
});

test("public registration requires a stable submission token for retries", async () => {
  const { repo, registrations } = createRepo();
  const service = createVolunteerService({ repo, now: () => new Date("2026-07-02T00:00:00.000Z") });
  await expect(
    service.submitPublicRegistration({
      activityId: activity.id,
      registrationType: "individual",
      participantCount: 1,
      contact: { name: "Ada", email: "ada@example.com", phone: "91234567", language: "zh-HK" },
      declaredAge: 21,
      consents: { email: true },
    }),
  ).rejects.toThrow();
  expect(registrations).toHaveLength(0);
});

test("a retried public registration uses the same token hash and status URL", async () => {
  const { repo, registrations } = createRepo();
  const token = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const service = createVolunteerService({
    repo,
    now: () => new Date("2026-07-02T00:00:00.000Z"),
    appUrl: "https://hkscda.test",
  });
  const request = {
    activityId: activity.id,
    registrationType: "individual",
    participantCount: 1,
    contact: { name: "Ada", email: "ada@example.com", phone: "91234567", language: "zh-HK" },
    declaredAge: 21,
    consents: { email: true },
    submissionToken: token,
  };
  const first = await service.submitPublicRegistration(request);
  const second = await service.submitPublicRegistration(request);
  expect(registrations).toHaveLength(2);
  expect((registrations[0] as { statusTokenHash: string }).statusTokenHash).toMatch(
    /^[0-9a-f]{64}$/,
  );
  expect((registrations[0] as { statusTokenHash: string }).statusTokenHash).toBe(
    (registrations[1] as { statusTokenHash: string }).statusTokenHash,
  );
  expect(first.statusUrl).toBe("https://hkscda.test/volunteer/status/" + token);
  expect(second.statusUrl).toBe(first.statusUrl);
});

test("public response reports a failed confirmation email while preserving registration", async () => {
  const { repo, registrations } = createRepo();
  const service = createVolunteerService({
    repo,
    now: () => new Date("2026-07-02T00:00:00.000Z"),
    sendRegistrationEmail: async () => "failed",
    logger: { error() {} },
  });
  const result = await service.submitPublicRegistration({
    activityId: activity.id,
    registrationType: "individual",
    participantCount: 1,
    contact: { name: "Ada", email: "ada@example.com", phone: "91234567", language: "zh-HK" },
    declaredAge: 21,
    consents: { email: true },
    submissionToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  });
  expect(registrations).toHaveLength(1);
  expect(result.confirmationEmailSent).toBe(false);
});

test("a registration replay retries a previously failed admin notification", async () => {
  const { repo } = createRepo({
    createRegistration: async () => ({ registration, created: false }),
  });
  let attempts = 0;
  await createVolunteerService({
    repo,
    now: () => new Date("2026-07-02T00:00:00.000Z"),
    notifyAdmins: async () => {
      attempts += 1;
      return "sent";
    },
    logger: { error() {} },
  }).submitPublicRegistration({
    activityId: activity.id,
    registrationType: "individual",
    participantCount: 1,
    contact: { name: "Ada", email: "ada@example.com", phone: "91234567", language: "zh-HK" },
    declaredAge: 21,
    consents: { email: true },
    submissionToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  });
  expect(attempts).toBe(1);
});

test("clone activity delegates mutation and audit as one repository command", async () => {
  const commands: unknown[] = [];
  const { repo } = createRepo({
    cloneActivity: async (input) => {
      commands.push(input);
      return "activity-clone";
    },
    insertAuditLog: async () => {
      throw new Error("separate audit write must not run");
    },
  });
  const result = await createVolunteerService({ repo }).cloneActivity({
    actorUserId: "actor-1",
    activityId: activity.id,
    input: { startsAt: "2026-09-01T02:00:00.000Z" },
  });
  expect(result).toEqual({ id: "activity-clone" });
  expect(commands).toEqual([
    {
      activityId: activity.id,
      actorUserId: "actor-1",
      startsAt: "2026-09-01T02:00:00.000Z",
    },
  ]);
});

describe("volunteer activity input validation — regression", () => {
  test("BUG-17: creating an activity whose endsAt is before startsAt returns 400 before the repository", async () => {
    let createCalled = false;
    const { repo } = createRepo({
      createActivity: async () => {
        createCalled = true;
        // What the DB check constraint does today.
        throw { code: "23514", message: "violates check constraint", details: null, hint: null };
      },
    });
    const handlers = createVolunteerHandlers({
      requireVolunteerAdmin: async () => ({
        id: "admin-row",
        authUserId: "11111111-2222-4333-8444-555555555555",
        email: "staff@example.com",
        role: "staff",
        status: "active",
      }),
      service: createVolunteerService({ repo }),
    });
    const original = console.error;
    console.error = () => {};
    try {
      const response = await handlers.createActivity({
        request: new Request("https://example.test/api/admin/volunteers/activities", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "cleaning_day",
            title: "清潔日",
            startsAt: "2026-11-01T02:00:00.000Z",
            endsAt: "2026-11-01T01:00:00.000Z",
            location: "荃灣",
            capacity: 5,
            registrationModes: ["individual"],
          }),
        }),
      });
      expect(response.status).toBe(400);
      expect(createCalled).toBe(false);
    } finally {
      console.error = original;
    }
  });
});
