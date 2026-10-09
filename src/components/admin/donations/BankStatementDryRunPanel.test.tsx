import { expect, test } from "bun:test";

import type { BankStatementDryRunResult } from "../../../lib/donations/bankStatementDryRun";
import { renderAdminInChinese } from "../i18n/testing";
import { BankStatementDryRunPanel, BankStatementDryRunPreview } from "./BankStatementDryRunPanel";

function result(count: number): BankStatementDryRunResult {
  return {
    fileSha256: "a".repeat(64),
    generatedAt: "2026-09-28T00:00:00.000Z",
    summary: {
      total: count,
      invalid: 0,
      duplicate: 0,
      credited: 0,
      candidates: count,
      unmatched: 0,
    },
    rows: Array.from({ length: count }, (_, index) => ({
      ordinal: index + 1,
      bankReference: `REF-${index + 1}`,
      referenceKey: `ref-${index + 1}`,
      receivedOn: "2026-09-27",
      amountCents: 10_000,
      paymentHint: null,
      invalidReason: null,
      status: "candidate_amount_only" as const,
      candidateCount: 1,
      candidates: [
        {
          id: `payment-${index + 1}`,
          provider: "fps" as const,
          providerRef: null,
          amountCents: 10_000,
          paymentStatus: "pending",
          donationStatus: "pending",
        },
      ],
    })),
  };
}

test("bank preview shows 25 rows per page, candidate evidence and no credit action", () => {
  const first = renderAdminInChinese(<BankStatementDryRunPreview result={result(26)} page={1} />);
  expect(first).toContain("REF-1");
  expect(first).toContain("REF-25");
  expect(first).not.toContain("REF-26");
  expect(first).toContain("payment-1");
  expect(first).toContain("只按金額候選");
  expect(first).not.toContain("確認入帳");
  const second = renderAdminInChinese(<BankStatementDryRunPreview result={result(26)} page={2} />);
  expect(second).toContain("REF-26");
  expect(second).not.toContain("REF-25");
});

test("finance panel labels its strict template and dry-run boundary", () => {
  const html = renderAdminInChinese(<BankStatementDryRunPanel actorUserId="synthetic-finance" />);
  expect(html).toContain("bank_reference,received_on,currency,amount_hkd,payment_hint");
  expect(html).toContain("只作預覽");
  expect(html).not.toContain(">確認入帳</button>");
});

test("only exact one-to-one candidate rows expose snapshot selection", () => {
  const mixed = result(2);
  mixed.rows[0]!.status = "candidate_exact";
  mixed.rows[0]!.paymentHint = "HINT-1";
  const html = renderAdminInChinese(
    <BankStatementDryRunPreview
      result={mixed}
      page={1}
      selectedOrdinals={[]}
      onToggle={() => {}}
    />,
  );
  expect(html).toContain('aria-label="選取第 1 行作確認預覽"');
  expect(html).not.toContain('aria-label="選取第 2 行作確認預覽"');
});
