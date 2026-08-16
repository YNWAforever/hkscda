import { describe, expect, test } from "bun:test";

import { createGroupEnquiryService, type GroupEnquiryRepository } from "./service";
import type { GroupEnquiry } from "./types";

const enquiry: GroupEnquiry = {
  id: "enquiry-1",
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
  status: "new",
  notificationStatus: "failed",
  notificationError: "SMTP down",
  assignedTo: null,
  adminNotes: null,
  idempotencyKey: "11111111-2222-4333-8444-555555555555",
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};

function createRepo() {
  const calls: Array<{ name: string; input?: unknown }> = [];
  const repo: GroupEnquiryRepository = {
    async createOrGet() {
      return { enquiry, created: true };
    },
    async markNotificationSent(id) {
      calls.push({ name: "markSent", input: id });
    },
    async markNotificationFailed(id, safeError) {
      calls.push({ name: "markFailed", input: { id, safeError } });
    },
    async list(input) {
      calls.push({ name: "list", input });
      return { enquiries: [enquiry], total: 1 };
    },
    async getById(id) {
      calls.push({ name: "get", input: id });
      return enquiry;
    },
    async update(id, input) {
      calls.push({ name: "update", input: { id, input } });
      return { ...enquiry, ...input };
    },
    async insertAuditLog(input) {
      calls.push({ name: "audit", input });
    },
  };
  return { repo, calls };
}

const actorUserId = "99999999-9999-4999-8999-999999999999";

describe("group enquiry admin service", () => {
  test("bounds search params and updates status/notes", async () => {
    const { repo, calls } = createRepo();
    const service = createGroupEnquiryService({ repo });
    await expect(
      service.listGroupEnquiries({ q: " school ", page: "0", pageSize: "99" }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      service.updateGroupEnquiry({
        id: "enquiry-1",
        input: { status: "resolved", adminNotes: " done " },
        actorUserId,
      }),
    ).resolves.toMatchObject({ enquiry: { status: "resolved" } });
    expect(calls[0].input).toMatchObject({ q: "school", page: 1, pageSize: 50 });
  });

  test("records who changed an enquiry, without copying the enquirer's details", async () => {
    // This route mutates group_enquiries over the service-role connection, where
    // auth.uid() is null and no trigger covers the table — so a reassignment or
    // status change had no actor attached to it anywhere. Detail stays to field
    // names and the new status: audit_log is readable by treasurer, and the row
    // itself holds the enquirer's email and phone.
    const { repo, calls } = createRepo();
    const service = createGroupEnquiryService({
      repo,
      now: () => new Date("2026-08-05T09:00:00.000Z"),
    });

    await service.updateGroupEnquiry({
      id: "enquiry-1",
      input: { status: "closed", adminNotes: "handled offline" },
      actorUserId,
    });

    expect(calls.map((call) => call.name)).toEqual(["update", "audit"]);
    expect(calls[1].input).toEqual({
      actor_user_id: actorUserId,
      action: "group_enquiries.update",
      entity: "group_enquiries",
      entity_id: "enquiry-1",
      timestamp: "2026-08-05T09:00:00.000Z",
      detail: { fields: ["adminNotes", "status"], status: "closed" },
    });
  });

  test("retries notification from the stored row without creating another enquiry", async () => {
    const { repo, calls } = createRepo();
    const service = createGroupEnquiryService({
      repo,
      notifyAdmins: async () => {
        calls.push({ name: "notify" });
      },
    });
    await expect(
      service.retryGroupEnquiryNotification({ id: "enquiry-1", actorUserId }),
    ).resolves.toEqual({ ok: true });
    expect(calls.map((call) => call.name)).toEqual(["get", "notify", "markSent", "audit"]);
  });
});
