import { describe, expect, test } from "bun:test";

import { createGroupEnquiryService, type GroupEnquiryRepository } from "./service";
import type { GroupEnquiry } from "./types";

const enquiry: GroupEnquiry = {
  id: "enquiry-1", organisationName: "Happy School", contactPerson: "Ms Chan", email: "lead@example.com", phone: "91234567",
  activityType: "school_talk", otherActivityDescription: null, participantCount: 30, participantAgeProfile: null, preferredDateNotes: null, message: null,
  status: "new", notificationStatus: "failed", notificationError: "SMTP down", assignedTo: null, adminNotes: null,
  idempotencyKey: "11111111-2222-4333-8444-555555555555", createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z",
};

function createRepo() {
  const calls: Array<{ name: string; input?: unknown }> = [];
  const repo: GroupEnquiryRepository = {
    async createOrGet() { return { enquiry, created: true }; },
    async markNotificationSent(id) { calls.push({ name: "markSent", input: id }); },
    async markNotificationFailed(id, safeError) { calls.push({ name: "markFailed", input: { id, safeError } }); },
    async list(input) { calls.push({ name: "list", input }); return { enquiries: [enquiry], total: 1 }; },
    async getById(id) { calls.push({ name: "get", input: id }); return enquiry; },
    async update(id, input) { calls.push({ name: "update", input: { id, input } }); return { ...enquiry, ...input }; },
  };
  return { repo, calls };
}

describe("group enquiry admin service", () => {
  test("bounds search params and updates status/notes", async () => {
    const { repo, calls } = createRepo();
    const service = createGroupEnquiryService({ repo });
    await expect(service.listGroupEnquiries({ q: " school ", page: "0", pageSize: "99" })).resolves.toMatchObject({ total: 1 });
    await expect(service.updateGroupEnquiry({ id: "enquiry-1", input: { status: "resolved", adminNotes: " done " } })).resolves.toMatchObject({ enquiry: { status: "resolved" } });
    expect(calls[0].input).toMatchObject({ q: "school", page: 1, pageSize: 50 });
  });

  test("retries notification from the stored row without creating another enquiry", async () => {
    const { repo, calls } = createRepo();
    const service = createGroupEnquiryService({ repo, notifyAdmins: async () => { calls.push({ name: "notify" }); } });
    await expect(service.retryGroupEnquiryNotification({ id: "enquiry-1" })).resolves.toEqual({ ok: true });
    expect(calls.map((call) => call.name)).toEqual(["get", "notify", "markSent"]);
  });
});
