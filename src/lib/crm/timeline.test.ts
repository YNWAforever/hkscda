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
});
