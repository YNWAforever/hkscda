import { expect, test } from "bun:test";

import {
  BankPreviewTooBroadError,
  type BankStatementDryRunResult,
} from "../../../../lib/donations/bankStatementDryRun.server";
import { createBankStatementPreviewHandler } from "./bank-statement-preview";

const url = "https://example.invalid/api/admin/finance/bank-statement-preview";
const result: BankStatementDryRunResult = {
  fileSha256: "a".repeat(64),
  generatedAt: "2026-09-28T00:00:00.000Z",
  rows: [],
  summary: { total: 0, invalid: 0, duplicate: 0, credited: 0, candidates: 0, unmatched: 0 },
};

test("bank dry-run API denies non-finance roles before reading file content", async () => {
  const calls: string[] = [];
  const handle = createBankStatementPreviewHandler({
    authorize: async (request) => {
      if (!request.headers.get("authorization")) throw new Response("", { status: 401 });
      if (request.headers.get("authorization") === "Bearer staff")
        throw new Response("", { status: 403 });
      return "treasurer-id";
    },
    preview: async (actor, csv) => {
      calls.push(`${actor}:${csv}`);
      return result;
    },
  });
  const post = (authorization?: string, body = JSON.stringify({ csvText: "canonical csv" })) =>
    handle(
      new Request(url, { method: "POST", headers: authorization ? { authorization } : {}, body }),
    );
  expect((await post()).status).toBe(401);
  expect((await post("Bearer staff")).status).toBe(403);
  expect(calls).toEqual([]);
  const response = await post("Bearer treasurer");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(calls).toEqual(["treasurer-id:canonical csv"]);
});

test("bank dry-run API bounds body and refuses GET, invalid JSON and broad candidates", async () => {
  let calls = 0;
  const handle = createBankStatementPreviewHandler({
    authorize: async () => "treasurer-id",
    preview: async () => {
      calls++;
      throw new BankPreviewTooBroadError("synthetic too broad");
    },
  });
  expect((await handle(new Request(url))).status).toBe(405);
  expect((await handle(new Request(url, { method: "POST", body: "{" }))).status).toBe(400);
  expect(
    (await handle(new Request(url, { method: "POST", body: "x".repeat(330 * 1024) }))).status,
  ).toBe(413);
  expect(calls).toBe(0);
  const broad = await handle(
    new Request(url, { method: "POST", body: JSON.stringify({ csvText: "x" }) }),
  );
  expect(broad.status).toBe(409);
  expect(broad.headers.get("cache-control")).toBe("no-store");
  expect(calls).toBe(1);
});
