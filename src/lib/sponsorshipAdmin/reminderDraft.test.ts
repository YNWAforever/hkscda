import { expect, test } from "bun:test";

import {
  buildSponsorshipReminderDraft,
  sponsorshipReminderFactsKey,
  type ReminderPledge,
} from "./reminderDraft";

const month = (periodMonth: string, outstandingCents: number, reversed = false) => ({
  id: `period-${periodMonth}`,
  periodMonth,
  outstandingCents,
  allocations: reversed ? [{ amountCents: -100 }] : [],
});

function pledge(overrides: Partial<ReminderPledge> = {}): ReminderPledge {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    supporterName: "陳小姐",
    supporterEmail: "supporter@example.invalid",
    language: "zh-HK",
    status: "active",
    proofHistory: [],
    periods: [month("2026-08-01", 12_345), month("2026-09-01", 10_000)],
    ...overrides,
  };
}

test("draft uses only the oldest open past month in Hong Kong and never calls it debt", () => {
  const draft = buildSponsorshipReminderDraft(pledge(), new Date("2026-09-28T02:00:00Z"));
  expect(draft.kind).toBe("draft");
  if (draft.kind !== "draft") return;
  expect(draft.periodMonth).toBe("2026-08-01");
  expect(draft.outstandingCents).toBe(12_345);
  expect(draft.recipient.email).toBe("supporter@example.invalid");
  expect(draft.body).toContain("2026-08");
  expect(draft.body).not.toContain("欠款");
  expect(draft.body).not.toContain("HK$123.45");
  expect(draft.body).not.toContain("FPS");
});

test("Hong Kong month boundary excludes the current month", () => {
  const result = buildSponsorshipReminderDraft(
    pledge({ periods: [month("2026-10-01", 10_000)] }),
    new Date("2026-09-30T17:00:00Z"),
  );
  expect(result).toEqual({ kind: "unavailable", reason: "no_past_open_period" });
});

test("paid, future and unsettled proof records never produce a reminder draft", () => {
  expect(
    buildSponsorshipReminderDraft(
      pledge({ periods: [month("2026-08-01", 0), month("2026-10-01", 10_000)] }),
      new Date("2026-09-28T02:00:00Z"),
    ),
  ).toEqual({ kind: "unavailable", reason: "no_past_open_period" });
  expect(
    buildSponsorshipReminderDraft(
      pledge({ proofHistory: [{ reviewStatus: "pending" }] }),
      new Date("2026-09-28T02:00:00Z"),
    ),
  ).toEqual({ kind: "unavailable", reason: "proof_pending" });
});

test("refund adjustment, invalid ledger, missing recipient and inactive pledge fail closed", () => {
  const now = new Date("2026-09-28T02:00:00Z");
  expect(buildSponsorshipReminderDraft(pledge({ status: "needs_followup" }), now)).toEqual({
    kind: "unavailable",
    reason: "status",
  });
  expect(buildSponsorshipReminderDraft(pledge({ supporterEmail: null }), now)).toEqual({
    kind: "unavailable",
    reason: "recipient",
  });
  expect(
    buildSponsorshipReminderDraft(pledge({ periods: [month("2026-08-01", 100, true)] }), now),
  ).toEqual({
    kind: "unavailable",
    reason: "adjustment_review",
  });
  expect(
    buildSponsorshipReminderDraft(pledge({ periods: [month("2026-08-01", Number.NaN)] }), now),
  ).toEqual({
    kind: "unavailable",
    reason: "invalid_ledger",
  });
});

test("English preference produces a neutral English draft", () => {
  const draft = buildSponsorshipReminderDraft(
    pledge({ language: "en", supporterName: "Alex" }),
    new Date("2026-09-28T02:00:00Z"),
  );
  expect(draft.kind).toBe("draft");
  if (draft.kind !== "draft") return;
  expect(draft.subject).toContain("Sponsorship record");
  expect(draft.body).toContain("Alex");
  expect(draft.body.toLowerCase()).not.toContain("debt");
});

test("ephemeral draft identity changes with every relevant current fact", () => {
  const original = pledge(),
    key = sponsorshipReminderFactsKey(original);
  expect(sponsorshipReminderFactsKey(pledge())).toBe(key);
  for (const changed of [
    pledge({ status: "cancelled" }),
    pledge({ supporterName: "Changed" }),
    pledge({ supporterEmail: "changed@example.invalid" }),
    pledge({ language: "en" }),
    pledge({ proofHistory: [{ reviewStatus: "pending" }] }),
    pledge({ periods: [month("2026-08-01", 0)] }),
    pledge({ periods: [month("2026-08-01", 12345, true)] }),
  ])
    expect(sponsorshipReminderFactsKey(changed)).not.toBe(key);
});
