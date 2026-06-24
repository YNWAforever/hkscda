import { describe, expect, test } from "bun:test";

import { buildConsentRowsForUpdate, latestConsentByChannel } from "./consent";

describe("crm consent helpers", () => {
  test("selects latest consent per channel", () => {
    const latest = latestConsentByChannel([
      {
        id: "1",
        supporterId: "s1",
        channel: "email",
        status: "opt_in",
        source: "donation_form",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        supporterId: "s1",
        channel: "email",
        status: "opt_out",
        source: "phone_call",
        timestamp: "2026-02-01T00:00:00.000Z",
      },
      {
        id: "3",
        supporterId: "s1",
        channel: "whatsapp",
        status: "opt_in",
        source: "admin_manual",
        timestamp: "2026-01-15T00:00:00.000Z",
      },
    ]);

    expect(latest.email?.status).toBe("opt_out");
    expect(latest.whatsapp?.status).toBe("opt_in");
  });

  test("builds append-only rows for provided channels", () => {
    expect(
      buildConsentRowsForUpdate({
        supporterId: "s1",
        update: {
          source: "phone_call",
          email: false,
          timestamp: "2026-06-24T09:00:00.000Z",
        },
      }),
    ).toEqual([
      {
        supporter_id: "s1",
        channel: "email",
        status: "opt_out",
        source: "phone_call",
        timestamp: "2026-06-24T09:00:00.000Z",
      },
    ]);
  });
});
