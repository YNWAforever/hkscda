import { describe, expect, test } from "bun:test";

import { createGroupEnquiryService, type GroupEnquiryRepository } from "./service";
import type { GroupEnquiry } from "./types";

const enquiry: GroupEnquiry = {
  id: "enquiry-1",
  organisationName: "Happy School",
  contactPerson: "Ms Chan",
  email: "lead@example.com",
  phone: "+85291234567",
  activityType: "school_talk",
  otherActivityDescription: null,
  participantCount: 30,
  participantAgeProfile: "P4-P6",
  preferredDateNotes: "Friday afternoons",
  message: "Please call before email.",
  status: "new",
  notificationStatus: "pending",
  notificationError: null,
  assignedTo: null,
  adminNotes: null,
  idempotencyKey: "11111111-2222-4333-8444-555555555555",
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};

function createRepo(
  result: { enquiry: GroupEnquiry; created: boolean } = { enquiry, created: true },
) {
  const calls: Array<{ name: string; input?: unknown }> = [];
  const repo: GroupEnquiryRepository = {
    async createOrGet(input) {
      calls.push({ name: "createOrGet", input });
      return result;
    },
    async markNotificationSent(id) {
      calls.push({ name: "markNotificationSent", input: id });
    },
    async markNotificationFailed(id, safeError) {
      calls.push({ name: "markNotificationFailed", input: { id, safeError } });
    },
    async list() {
      return { enquiries: [], total: 0 };
    },
    async getById() {
      return null;
    },
    async update() {
      return enquiry;
    },
    async insertAuditLog(input) {
      calls.push({ name: "insertAuditLog", input });
    },
  };
  return { repo, calls };
}

const payload = {
  organisationName: " Happy School ",
  contactPerson: " Ms Chan ",
  email: "LEAD@example.COM ",
  phone: " +852 9123 4567 ",
  activityType: "school_talk",
  participantCount: "30",
  participantAgeProfile: " P4-P6 ",
  preferredDateNotes: " Friday afternoons ",
  message: " Please call before email. ",
  idempotencyKey: "11111111-2222-4333-8444-555555555555",
  turnstileToken: "token",
};

describe("group enquiry service", () => {
  test("persists normalized public input before notifying", async () => {
    const { repo, calls } = createRepo();
    const service = createGroupEnquiryService({
      repo,
      notifyAdmins: async () => {
        calls.push({ name: "notifyAdmins" });
      },
    });

    await expect(service.submitPublicEnquiry(payload)).resolves.toEqual({
      ok: true,
      enquiryId: "enquiry-1",
    });
    expect(calls.map((call) => call.name)).toEqual([
      "createOrGet",
      "notifyAdmins",
      "markNotificationSent",
    ]);
    expect(calls[0].input).toMatchObject({
      organisationName: "Happy School",
      contactPerson: "Ms Chan",
      email: "lead@example.com",
      phone: "+85291234567",
      participantCount: 30,
      idempotencyKey: payload.idempotencyKey,
    });
  });

  test("replays existing idempotency keys without sending duplicate notifications", async () => {
    const { repo, calls } = createRepo({ enquiry, created: false });
    const service = createGroupEnquiryService({
      repo,
      notifyAdmins: async () => {
        calls.push({ name: "notifyAdmins" });
      },
    });

    await expect(service.submitPublicEnquiry(payload)).resolves.toEqual({
      ok: true,
      enquiryId: "enquiry-1",
    });
    expect(calls.map((call) => call.name)).toEqual(["createOrGet"]);
  });

  test("keeps public success after notification failure and stores a bounded diagnostic", async () => {
    const { repo, calls } = createRepo();
    const service = createGroupEnquiryService({
      repo,
      notifyAdmins: async () => {
        throw new Error("SMTP secret and stack trace that should be bounded".repeat(20));
      },
      logger: { error: () => undefined },
    });

    await expect(service.submitPublicEnquiry(payload)).resolves.toEqual({
      ok: true,
      enquiryId: "enquiry-1",
    });
    expect(calls.map((call) => call.name)).toEqual(["createOrGet", "markNotificationFailed"]);
    expect(String((calls[1].input as { safeError: string }).safeError).length).toBeLessThanOrEqual(
      300,
    );
  });
});
