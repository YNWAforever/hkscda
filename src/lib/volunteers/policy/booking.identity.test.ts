import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireVerifiedVolunteer } from "./booking.repository.server";

const request = new Request("https://unit-test.invalid/api/internships/attachment", {
  headers: { authorization: "Bearer existing-token" },
});
const now = () => new Date("2026-09-26T12:00:00.000Z");

function clientWithUser(bannedUntil?: string) {
  return {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "volunteer-a",
            email_confirmed_at: "2026-01-01T00:00:00.000Z",
            banned_until: bannedUntil,
          },
        },
        error: null,
      }),
    },
  } as unknown as SupabaseClient;
}

test("rejects an already-issued token while its owner is banned", async () => {
  await expect(
    requireVerifiedVolunteer(request, clientWithUser("2026-09-27T00:00:00.000Z"), now),
  ).rejects.toMatchObject({ status: 403 });
});

test("accepts an expired ban", async () => {
  expect(
    await requireVerifiedVolunteer(request, clientWithUser("2026-09-26T11:59:59.000Z"), now),
  ).toBe("volunteer-a");
});

test("accepts a verified volunteer without a ban", async () => {
  expect(await requireVerifiedVolunteer(request, clientWithUser(), now)).toBe("volunteer-a");
});

test("rejects an invalid ban expiry instead of granting access", async () => {
  await expect(
    requireVerifiedVolunteer(request, clientWithUser("invalid-date"), now),
  ).rejects.toMatchObject({ status: 403 });
});
