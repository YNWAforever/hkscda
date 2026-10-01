import { expect, test } from "bun:test";

import type { ReminderPledge } from "../../../../../lib/sponsorshipAdmin/reminderDraft";
import { createSponsorshipReminderDraftHandler } from "./$id/reminder-draft";

const id = "11111111-1111-4111-8111-111111111111";
const url = `https://example.invalid/api/admin/sponsorships/pledges/${id}/reminder-draft`;
const detail: ReminderPledge = {
  id,
  supporterName: "Alex",
  supporterEmail: "alex@example.invalid",
  language: "en",
  status: "active",
  proofHistory: [],
  periods: [{ id: "period-1", periodMonth: "2026-08-01", outstandingCents: 100, allocations: [] }],
};

test("reminder API checks staff role before reading private recipient data", async () => {
  let reads = 0;
  const handler = createSponsorshipReminderDraftHandler({
    authorize: async (request) => {
      if (!request.headers.get("authorization")) throw new Response("", { status: 401 });
      if (request.headers.get("authorization") === "Bearer treasurer")
        throw new Response("", { status: 403 });
    },
    load: async () => {
      reads++;
      return detail;
    },
    now: () => new Date("2026-09-28T02:00:00Z"),
  });
  expect((await handler(new Request(url), id)).status).toBe(401);
  expect(
    (await handler(new Request(url, { headers: { authorization: "Bearer treasurer" } }), id))
      .status,
  ).toBe(403);
  expect(reads).toBe(0);
  const response = await handler(
    new Request(url, { headers: { authorization: "Bearer staff" } }),
    id,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.json()).recipient.email).toBe("alex@example.invalid");
  expect(reads).toBe(1);
});

test("reminder API rejects invalid ID, missing pledge and write methods without sending", async () => {
  const handler = createSponsorshipReminderDraftHandler({
    authorize: async () => {},
    load: async () => null,
    now: () => new Date("2026-09-28T02:00:00Z"),
  });
  expect((await handler(new Request(url, { method: "POST" }), id)).status).toBe(405);
  expect((await handler(new Request(url), "not-an-id")).status).toBe(400);
  const missing = await handler(new Request(url), id);
  expect(missing.status).toBe(404);
  expect(missing.headers.get("cache-control")).toBe("no-store");
});
