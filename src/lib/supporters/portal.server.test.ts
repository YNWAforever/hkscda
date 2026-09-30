import { expect, test } from "bun:test";
import { listMyRecords, requireVerifiedPrincipal, type AuthReader } from "./portal.server";

const userId = "11111111-1111-4111-8111-111111111111";
const auth = (user: Awaited<ReturnType<AuthReader["getUser"]>>["data"]["user"]): AuthReader => ({
  getUser: async () => ({ data: { user }, error: null }),
});

test("fresh bearer verification rejects absent, unconfirmed and banned users", async () => {
  await expect(
    requireVerifiedPrincipal(new Request("https://example.invalid"), auth(null)),
  ).rejects.toMatchObject({ status: 401 });
  const request = new Request("https://example.invalid", {
    headers: { authorization: "Bearer fresh-token" },
  });
  await expect(
    requireVerifiedPrincipal(
      request,
      auth({
        id: userId,
        email: "a@example.invalid",
        email_confirmed_at: null,
      }),
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    requireVerifiedPrincipal(
      request,
      auth({
        id: userId,
        email: "a@example.invalid",
        email_confirmed_at: "2026-09-27",
        banned_until: "2099-01-01",
      }),
    ),
  ).rejects.toMatchObject({ status: 403 });
});

test("record reader receives only the freshly verified email, never a client supporter id", async () => {
  const request = new Request("https://example.invalid/?supporterId=other", {
    headers: { authorization: "Bearer fresh-token" },
  });
  const principal = await requireVerifiedPrincipal(
    request,
    auth({
      id: userId,
      email: "OWNER@EXAMPLE.INVALID",
      email_confirmed_at: "2026-09-27",
    }),
  );
  const seen: string[] = [];
  const records = await listMyRecords(principal, {
    listByEmail: async (email) => {
      seen.push(email);
      return { adoption: [], sponsorship: [], donations: [], receipts: [], marketingEmail: null };
    },
  });
  expect(seen).toEqual(["owner@example.invalid"]);
  expect(records.receipts).toEqual([]);
});
