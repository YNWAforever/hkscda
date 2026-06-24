import { describe, expect, test } from "bun:test";

import { buildConsentRowsForUpdate, latestConsentByChannel } from "./consent";

describe("crm consent helpers", () => {
  test("selects latest consent per channel", () => {
    const rows = [
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
    ] as const;

    const latest = latestConsentByChannel([...rows]);

    expect(latest.email?.status).toBe("opt_out");
    expect(latest.whatsapp?.status).toBe("opt_in");
  });

  test("does not mutate input order and returns null for absent channels", () => {
    const rows = [
      {
        id: "1",
        supporterId: "s1",
        channel: "email" as const,
        status: "opt_in" as const,
        source: "donation_form",
        timestamp: "2026-02-01T00:00:00.000Z",
      },
      {
        id: "2",
        supporterId: "s1",
        channel: "email" as const,
        status: "opt_out" as const,
        source: "phone_call",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ];

    const latest = latestConsentByChannel(rows);

    expect(rows.map((row) => row.id)).toEqual(["1", "2"]);
    expect(latest.email?.id).toBe("1");
    expect(latest.whatsapp).toBeNull();
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
