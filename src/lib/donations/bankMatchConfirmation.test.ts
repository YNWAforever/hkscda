import { expect, test } from "bun:test";

import type { BankStatementPreviewRow } from "./bankStatementDryRun";
import { BankMatchSelectionError, selectExactBankMatchItems } from "./bankMatchConfirmation";

const candidate = (id: string) => ({
  id,
  provider: "fps" as const,
  providerRef: `HINT-${id}`,
  amountCents: 10000,
  paymentStatus: "pending",
  donationStatus: "pending",
});
const row = (
  ordinal: number,
  paymentId: string,
  status: BankStatementPreviewRow["status"] = "candidate_exact",
): BankStatementPreviewRow => ({
  ordinal,
  bankReference: `BANK-${ordinal}`,
  referenceKey: `bank-${ordinal}`,
  receivedOn: "2026-09-28",
  amountCents: 10000,
  paymentHint: `HINT-${paymentId}`,
  invalidReason: null,
  status,
  candidateCount: 1,
  candidates: [candidate(paymentId)],
});

test("only unique exact reference-to-payment groups become a snapshot", () => {
  const rows = [
    row(1, "payment-a"),
    row(2, "payment-b"),
    row(3, "payment-c", "candidate_amount_only"),
  ];
  expect(selectExactBankMatchItems(rows, [2, 1])).toEqual([
    {
      ordinal: 2,
      paymentId: "payment-b",
      bankReference: "BANK-2",
      paymentHint: "HINT-payment-b",
      amountCents: 10000,
    },
    {
      ordinal: 1,
      paymentId: "payment-a",
      bankReference: "BANK-1",
      paymentHint: "HINT-payment-a",
      amountCents: 10000,
    },
  ]);
  expect(() => selectExactBankMatchItems(rows, [3])).toThrow(BankMatchSelectionError);
  const forged = row(4, "payment-d");
  forged.paymentHint = "OTHER-HINT";
  expect(() => selectExactBankMatchItems([forged], [4])).toThrow(BankMatchSelectionError);
  expect(() => selectExactBankMatchItems(rows, [1, 1])).toThrow(BankMatchSelectionError);
  expect(() => selectExactBankMatchItems([row(1, "same"), row(2, "same")], [1, 2])).toThrow(
    BankMatchSelectionError,
  );
  expect(() => selectExactBankMatchItems(rows, [])).toThrow(BankMatchSelectionError);
  expect(() =>
    selectExactBankMatchItems(
      rows,
      Array.from({ length: 1001 }, (_, i) => i + 1),
    ),
  ).toThrow(BankMatchSelectionError);
});

test("exact selection spans 25 visible rows and 1000 matching rows without truncation", () => {
  const rows = Array.from({ length: 1000 }, (_, index) => row(index + 1, `payment-${index + 1}`));
  expect(
    selectExactBankMatchItems(
      rows,
      Array.from({ length: 25 }, (_, index) => index + 1),
    ),
  ).toHaveLength(25);
  const all = selectExactBankMatchItems(
    rows,
    rows.map((item) => item.ordinal),
  );
  expect(all).toHaveLength(1000);
  expect(all.at(-1)?.ordinal).toBe(1000);
});
