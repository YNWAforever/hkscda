import { describe, expect, test } from "bun:test";

import { assembleSupporterTimeline } from "./timeline";

describe("crm timeline", () => {
  test("combines supporter events newest first", () => {
    const timeline = assembleSupporterTimeline({
      donations: [
        {
          id: "d1",
          amountCents: 20000,
          currency: "HKD",
          purpose: "medical",
          customPurpose: null,
          status: "succeeded",
          method: "fps",
          receiptRequested: true,
          createdAt: "2026-06-01T10:00:00.000Z",
        },
      ],
      payments: [
        {
          id: "p1",
          donationId: "d1",
          provider: "fps",
          providerRef: "HKSCDA-ABC12345",
          amountCents: 20000,
          status: "succeeded",
          receivedAt: "2026-06-02T10:00:00.000Z",
          bankReference: "FPS-1",
          createdAt: "2026-06-01T10:01:00.000Z",
        },
      ],
      receipts: [
        {
          id: "r1",
          receiptNo: "HKSCDA-2026-000001",
          donationIds: ["d1"],
          totalAmountCents: 20000,
          issuedAt: "2026-06-03T10:00:00.000Z",
          status: "issued",
          pdfUrl: "2026/HKSCDA-2026-000001.pdf",
        },
      ],
      consents: [],
      messages: [],
      auditLogs: [],
    });

    expect(timeline.map((item) => item.kind)).toEqual(["receipt", "payment", "donation"]);
    expect(timeline[0].title).toContain("HKSCDA-2026-000001");
  });

  test("uses fallback descriptions for payments and messages", () => {
    const timeline = assembleSupporterTimeline({
      donations: [],
      payments: [
        {
          id: "p1",
          donationId: "d1",
          provider: "manual",
          providerRef: null,
          amountCents: 5000,
          status: "pending",
          receivedAt: null,
          bankReference: null,
          createdAt: "2026-06-01T10:00:00.000Z",
        },
      ],
      receipts: [],
      consents: [],
      messages: [
        {
          id: "m1",
          channel: "email",
          status: "queued",
          payload: {},
          sentAt: null,
          createdAt: "2026-06-02T10:00:00.000Z",
        },
        {
          id: "m2",
          channel: "email",
          status: "sent",
          payload: { subject: "Receipt ready" },
          sentAt: "2026-06-03T10:00:00.000Z",
          createdAt: "2026-06-02T09:00:00.000Z",
        },
      ],
      auditLogs: [],
    });

    expect(timeline.map((item) => item.id)).toEqual(["message:m2", "message:m1", "payment:p1"]);
    expect(timeline.find((item) => item.id === "message:m1")?.description).toBe("Message");
    expect(timeline.find((item) => item.id === "message:m2")?.description).toBe("Receipt ready");
    expect(timeline.find((item) => item.id === "payment:p1")?.description).toContain("manual");
  });

  test("combines adoption events with CRM activity newest first", () => {
    const timeline = assembleSupporterTimeline({
      donations: [
        {
          id: "d1",
          amountCents: 20000,
          currency: "HKD",
          purpose: "medical",
          customPurpose: null,
          status: "succeeded",
          method: "fps",
          receiptRequested: true,
          createdAt: "2026-06-01T10:00:00.000Z",
        },
      ],
      payments: [],
      receipts: [],
      consents: [],
      messages: [],
      auditLogs: [],
      adoption: {
        profiles: [],
        cases: [
          {
            id: "case-1",
            adopterProfileId: "profile-1",
            applicantName: "Ada",
            animalType: "cat",
            status: { key: "contacted", labelZh: "已聯絡", labelEn: "Contacted", color: "cyan" },
            requestedAnimalName: "Mochi",
            createdAt: "2026-06-02T10:00:00.000Z",
            closedAt: "2026-06-05T10:00:00.000Z",
          },
        ],
        followups: [
          {
            id: "task-1",
            adoptionCaseId: "case-1",
            adopterProfileId: "profile-1",
            title: "Home visit",
            taskType: "home_visit",
            status: { key: "scheduled", labelZh: "已安排", labelEn: "Scheduled", color: "coral" },
            priority: "normal",
            dueAt: "2026-06-03T10:00:00.000Z",
            scheduledAt: "2026-06-04T10:00:00.000Z",
            completedAt: "2026-06-04T11:00:00.000Z",
            volunteer: "May",
            contactChannel: "phone",
            createdAt: "2026-06-03T09:00:00.000Z",
            updatedAt: "2026-06-04T11:15:00.000Z",
          },
        ],
        successfulAdoptions: [
          {
            id: "success-1",
            adoptionCaseId: "case-1",
            adopterProfileId: "profile-1",
            supporterId: "supporter-1",
            caseNumber: "AD-2026-0001",
            animalId: "animal-1",
            animalName: "Mochi",
            adoptionFeeCents: 80000,
            approvalDate: "2026-06-06T10:00:00.000Z",
            pickupDate: "2026-06-07T10:00:00.000Z",
          },
        ],
      },
    });

    expect(timeline.map((item) => item.id)).toEqual([
      "successful_adoption:success-1:pickup",
      "successful_adoption:success-1:approval",
      "adoption_case:case-1:closed",
      "adoption_followup:task-1:completed",
      "adoption_followup:task-1:scheduled",
      "adoption_case:case-1:created",
      "donation:d1",
    ]);
    expect(timeline[0]).toMatchObject({
      kind: "successful_adoption",
      title: "Adoption pickup AD-2026-0001",
      amountCents: 80000,
      link: { to: "/admin/applications/$id", params: { id: "case-1" } },
    });
  });

  test("omits adoption timeline events when optional dates are missing", () => {
    const timeline = assembleSupporterTimeline({
      donations: [],
      payments: [],
      receipts: [],
      consents: [],
      messages: [],
      auditLogs: [],
      adoption: {
        profiles: [],
        cases: [
          {
            id: "case-1",
            adopterProfileId: null,
            applicantName: "Ada",
            animalType: "dog",
            status: { key: "screening", labelZh: "篩選中", labelEn: "Screening", color: "blue" },
            requestedAnimalName: null,
            createdAt: "2026-06-02T10:00:00.000Z",
            closedAt: null,
          },
        ],
        followups: [
          {
            id: "task-1",
            adoptionCaseId: null,
            adopterProfileId: "profile-1",
            title: "Profile follow-up",
            taskType: "followup",
            status: { key: "open", labelZh: "未完成", labelEn: "Open", color: "amber" },
            priority: "high",
            dueAt: null,
            scheduledAt: null,
            completedAt: null,
            volunteer: null,
            contactChannel: null,
            createdAt: "2026-06-03T09:00:00.000Z",
            updatedAt: "2026-06-03T09:00:00.000Z",
          },
        ],
        successfulAdoptions: [],
      },
    });

    expect(timeline.map((item) => item.id)).toEqual([
      "adoption_followup:task-1:created",
      "adoption_case:case-1:created",
    ]);
    expect(timeline[0].link).toEqual({
      to: "/admin/coordinator/adopters/$id",
      params: { id: "profile-1" },
    });
  });

  test("includes volunteer registration and completion timeline events", () => {
    const timeline = assembleSupporterTimeline({
      donations: [],
      payments: [],
      receipts: [],
      consents: [],
      messages: [],
      auditLogs: [],
      volunteer: {
        registrations: [
          {
            id: "reg-1",
            activityId: "activity-1",
            activityTitle: "七月清潔日",
            activityType: "cleaning_day",
            startsAt: "2026-07-20T02:00:00.000Z",
            status: "approved",
            statusReason: "auto_approved",
            attendanceStatus: "completed",
            participantCount: 3,
            volunteerHours: 9,
            createdAt: "2026-07-01T02:00:00.000Z",
            updatedAt: "2026-07-20T06:00:00.000Z",
          },
        ],
      },
    });

    expect(timeline.map((item) => item.id)).toEqual([
      "volunteer_registration:reg-1:completed",
      "volunteer_registration:reg-1:approved",
      "volunteer_registration:reg-1:submitted",
    ]);
    expect(timeline[0]).toMatchObject({
      kind: "volunteer_registration",
      title: "Volunteer completed: 七月清潔日",
      description: "3 people · 9 hours",
      link: { to: "/admin/volunteers/registrations/$id", params: { id: "reg-1" } },
    });
  });
});
