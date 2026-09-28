import { expect, test } from "bun:test";

import {
  BankPreviewTooBroadError,
  createBankStatementDryRunService,
} from "./bankStatementDryRun.server";

const header = "bank_reference,received_on,currency,amount_hkd,payment_hint";

test("server hashes the file and requests only valid normalized lookup keys", async () => {
  const calls: Array<{ actor: string; references: string[]; amounts: number[] }> = [];
  const service = createBankStatementDryRunService({
    lookup: async (actor, references, amounts) => {
      calls.push({ actor, references, amounts });
      return { kind: "ok", creditedReferences: [], pendingPayments: [] };
    },
    now: () => new Date("2026-09-28T00:00:00Z"),
  });
  const csv = `${header}\n REF-A ,2026-09-27,HKD,100.00,\nREF-B,2026-09-27,USD,200.00,`;
  const result = await service("actor-1", csv);
  expect(calls).toEqual([{ actor: "actor-1", references: ["ref-a"], amounts: [10_000] }]);
  expect(result.fileSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(result.generatedAt).toBe("2026-09-28T00:00:00.000Z");
  expect(result.rows.map((row) => row.status)).toEqual(["unmatched", "invalid"]);
  expect(result.summary).toEqual({
    total: 2,
    invalid: 1,
    duplicate: 0,
    credited: 0,
    candidates: 0,
    unmatched: 1,
  });
});

test("too-broad candidate catalog stops the whole preview", async () => {
  const service = createBankStatementDryRunService({
    lookup: async () => ({ kind: "too_broad" }),
    now: () => new Date("2026-09-28T00:00:00Z"),
  });
  await expect(
    service("actor-1", `${header}\nREF-A,2026-09-27,HKD,100.00,`),
  ).rejects.toBeInstanceOf(BankPreviewTooBroadError);
});
