import { expect, test } from "bun:test";
import { createReceiptDownloadHandler } from "./$receiptId";

const url = "https://example.invalid/api/supporter/receipts/11111111-1111-4111-8111-111111111111";

test("receipt URL is signed only for freshly verified owner", async () => {
  const seen: string[] = [];
  const handle = createReceiptDownloadHandler({
    auth: {
      getUser: async (token) => ({
        data: {
          user:
            token === "owner"
              ? { id: "u1", email: "owner@example.invalid", email_confirmed_at: "2026-09-27" }
              : null,
        },
        error: null,
      }),
    },
    find: async (email) => {
      seen.push(email);
      return email === "owner@example.invalid" ? { path: "2026/R1.pdf", fileName: "R1.pdf" } : null;
    },
    sign: async () => "https://storage.example.invalid/signed",
  });
  const absent = await handle({
    request: new Request(url),
    params: { receiptId: "11111111-1111-4111-8111-111111111111" },
  });
  expect(absent.status).toBe(401);
  const owner = await handle({
    request: new Request(url, {
      headers: { authorization: "Bearer owner" },
    }),
    params: { receiptId: "11111111-1111-4111-8111-111111111111" },
  });
  expect(owner.status).toBe(200);
  expect(owner.headers.get("cache-control")).toBe("no-store");
  expect((await owner.json()).url).toContain("signed");
  expect(seen).toEqual(["owner@example.invalid"]);
});
