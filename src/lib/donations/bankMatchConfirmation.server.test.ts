import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "bun:test";

import type { BankStatementDryRunResult } from "./bankStatementDryRun";
import {
  createBankMatchPreviewService,
  createSupabaseBankMatchRepository,
} from "./bankMatchConfirmation.server";

const paymentId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const preview: BankStatementDryRunResult = {
  fileSha256: "a".repeat(64),
  generatedAt: "2026-09-28T00:00:00.000Z",
  summary: { total: 1, invalid: 0, duplicate: 0, credited: 0, candidates: 1, unmatched: 0 },
  rows: [
    {
      ordinal: 1,
      bankReference: "BANK-1",
      referenceKey: "bank-1",
      receivedOn: "2026-09-28",
      amountCents: 10000,
      paymentHint: "HINT-1",
      invalidReason: null,
      status: "candidate_exact",
      candidateCount: 1,
      candidates: [
        {
          id: paymentId,
          provider: "fps",
          providerRef: "HINT-1",
          amountCents: 10000,
          paymentStatus: "pending",
          donationStatus: "pending",
        },
      ],
    },
  ],
};
const operation = {
  operationId,
  fileSha256: preview.fileSha256,
  createdAt: "2026-09-28T00:00:00.000Z",
  expiresAt: "2026-09-28T00:15:00.000Z",
  state: "queued" as const,
  items: [
    {
      ordinal: 1,
      paymentId,
      bankReference: "BANK-1",
      amountCents: 10000,
      status: "pending" as const,
      reasonCode: null,
      deliveryJobId: null,
      appliedAt: null,
    },
  ],
};

test("server re-previews CSV and persists only the selected exact match", async () => {
  const calls: unknown[][] = [];
  const service = createBankMatchPreviewService({
    preview: async (...args) => {
      calls.push(["preview", ...args]);
      return preview;
    },
    persist: async (...args) => {
      calls.push(["persist", ...args]);
      return operation;
    },
  });
  expect(await service("actor", "canonical CSV", [1])).toEqual(operation);
  expect(calls).toEqual([
    ["preview", "actor", "canonical CSV"],
    [
      "persist",
      "actor",
      preview.fileSha256,
      [{ ordinal: 1, paymentId, bankReference: "BANK-1", amountCents: 10000 }],
    ],
  ]);
});

test("service RPCs forward actor and operation without direct table reads", async () => {
  const calls: unknown[][] = [];
  const client = {
    rpc: async (...args: unknown[]) => {
      calls.push(args);
      return {
        data:
          calls.length === 3
            ? {
                ordinal: 1,
                paymentId,
                status: "succeeded",
                reasonCode: null,
                deliveryJobId: operationId,
              }
            : operation,
        error: null,
      };
    },
  } as unknown as SupabaseClient;
  const repository = createSupabaseBankMatchRepository(client);
  expect(
    await repository.create("actor", preview.fileSha256, [
      { ordinal: 1, paymentId, bankReference: "BANK-1", amountCents: 10000 },
    ]),
  ).toEqual(operation);
  expect(await repository.get("actor", operationId)).toEqual(operation);
  expect((await repository.apply("actor", operationId, 1)).status).toBe("succeeded");
  expect(calls.map((call) => call[0])).toEqual([
    "create_finance_bank_match_preview",
    "get_finance_bank_match_operation",
    "apply_finance_bank_match_item",
  ]);
  expect(calls[2]?.[1]).toEqual({ p_actor: "actor", p_operation: operationId, p_ordinal: 1 });
});
