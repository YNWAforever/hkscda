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
});
