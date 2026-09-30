import { expect, test } from "bun:test";

import {
  parseBankStatementCsv,
  previewBankStatement,
  type BankMatchCatalog,
} from "./bankStatementDryRun";

const header = "bank_reference,received_on,currency,amount_hkd,payment_hint";

test("strict canonical CSV handles BOM, CRLF and quoted fields without floating money", () => {
  const rows = parseBankStatementCsv(
    `\uFEFF${header}\r\n"  FPS-001  ",2026-09-27,HKD,123.45,"INT, 01"\r\n`,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    ordinal: 1,
    bankReference: "FPS-001",
    referenceKey: "fps-001",
    receivedOn: "2026-09-27",
    amountCents: 12_345,
    paymentHint: "INT, 01",
    invalidReason: null,
  });
});

test("syntax and size failures reject a whole file before any lookup", () => {
  expect(() => parseBankStatementCsv("wrong,header\n1,2")).toThrow();
  expect(() => parseBankStatementCsv(`${header}\n"unterminated,2026-09-27,HKD,1.00,x`)).toThrow();
  const tooMany = `${header}\n${Array.from({ length: 1001 }, (_, i) => `REF-${i},2026-09-27,HKD,1.00,`).join("\n")}`;
  expect(() => parseBankStatementCsv(tooMany)).toThrow();
});

test("invalid currency, date, amount and formula-like reference are per-row refusals", () => {
  const rows = parseBankStatementCsv(
    `${header}\nUSD-1,2026-09-27,USD,1.00,\nDATE-1,2026-02-30,HKD,1.00,\nAMT-1,2026-09-27,HKD,-1.00,\n=SUM(1),2026-09-27,HKD,1.00,`,
  );
  expect(rows.map((row) => row.invalidReason)).toEqual(["currency", "date", "amount", "reference"]);
  expect(rows.every((row) => row.amountCents === null || row.amountCents > 0)).toBe(true);
});

test("preview flags both file duplicates and a previously credited bank reference", () => {
  const rows = parseBankStatementCsv(
    `${header}\nREF-1,2026-09-27,HKD,100.00,\n ref-1 ,2026-09-27,HKD,100.00,\nREF-2,2026-09-27,HKD,200.00,`,
  );
  const catalog: BankMatchCatalog = {
    creditedReferences: ["ref-2"],
    pendingPayments: [],
  };
  expect(previewBankStatement(rows, catalog).map((row) => row.status)).toEqual([
    "duplicate_file",
    "duplicate_file",
    "already_credited",
  ]);
});

test("hint and amount produce candidates only; no row selects or credits a payment", () => {
  const rows = parseBankStatementCsv(
    `${header}\nREF-1,2026-09-27,HKD,100.00,PAY-A\nREF-2,2026-09-27,HKD,100.00,\nREF-3,2026-09-27,HKD,200.00,PAY-X`,
  );
  const catalog: BankMatchCatalog = {
    creditedReferences: [],
    pendingPayments: [
      {
        id: "a",
        provider: "fps",
        providerRef: "PAY-A",
        amountCents: 10_000,
        paymentStatus: "pending",
        donationStatus: "pending",
      },
      {
        id: "b",
        provider: "manual",
        providerRef: "PAY-B",
        amountCents: 10_000,
        paymentStatus: "pending",
        donationStatus: "pending",
      },
      {
        id: "c",
        provider: "manual",
        providerRef: "PAY-X",
        amountCents: 20_000,
        paymentStatus: "succeeded",
        donationStatus: "pending",
      },
    ],
  };
  const preview = previewBankStatement(rows, catalog);
  expect(preview.map((row) => row.status)).toEqual(["candidate_exact", "ambiguous", "unmatched"]);
  expect(preview[0]?.candidates.map((payment) => payment.id)).toEqual(["a"]);
  expect(preview[1]?.candidates.map((payment) => payment.id)).toEqual(["a", "b"]);
  expect(preview.every((row) => !("selectedPaymentId" in row))).toBe(true);
});

test("invalid duplicate occurrences still exclude a valid reference from candidates", () => {
  const rows = parseBankStatementCsv(
    `${header}\nREF-1,2026-09-27,HKD,100.00,\n ref-1 ,2026-09-27,USD,100.00,`,
  );
  const result = previewBankStatement(rows, {
    creditedReferences: [],
    pendingPayments: [
      {
        id: "candidate",
        provider: "manual",
        providerRef: null,
        amountCents: 10000,
        paymentStatus: "pending",
        donationStatus: "pending",
      },
    ],
  });
  expect(result.map((r) => r.status)).toEqual(["duplicate_file", "invalid"]);
  expect(result.every((r) => r.candidateCount === 0)).toBe(true);
});
