import { expect, test } from "bun:test";
import { createPortalRecordsHandler } from "./records";

const url = "https://example.invalid/api/supporter/records?supporterId=other";

test("records API requires fresh verified email and never accepts caller supporterId", async () => {
  const seen: string[] = [];
  const handle = createPortalRecordsHandler({
    auth: {
      getUser: async (token) => ({
        data: {
          user:
            token === "good"
              ? { id: "u1", email: "owner@example.invalid", email_confirmed_at: "2026-09-27" }
              : null,
        },
        error: null,
      }),
    },
    repository: {
      listByEmail: async (email) => {
        seen.push(email);
        return { adoption: [], sponsorship: [], donations: [], receipts: [], marketingEmail: null };
      },
    },
  });
  const missing = await handle({ request: new Request(url) });
  expect(missing.status).toBe(401);
  const wrong = await handle({
    request: new Request(url, {
      headers: { authorization: "Bearer wrong" },
    }),
  });
  expect(wrong.status).toBe(401);
  const good = await handle({
    request: new Request(url, {
      headers: { authorization: "Bearer good" },
    }),
  });
  expect(good.status).toBe(200);
  expect(good.headers.get("cache-control")).toBe("no-store");
  expect(seen).toEqual(["owner@example.invalid"]);
});
