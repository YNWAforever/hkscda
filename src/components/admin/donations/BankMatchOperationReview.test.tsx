import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { BankMatchOperation } from "../../../lib/donations/bankMatchConfirmation";
import { BankMatchOperationReview } from "./BankMatchOperationReview";

const operation: BankMatchOperation = {
  operationId: "22222222-2222-4222-8222-222222222222",
  fileSha256: "a".repeat(64),
  createdAt: "2026-09-28T00:00:00.000Z",
  expiresAt: "2026-09-28T00:15:00.000Z",
  state: "partial",
  items: [
    {
      ordinal: 1,
      paymentId: "11111111-1111-4111-8111-111111111111",
      bankReference: "BANK-1",
      amountCents: 10000,
      status: "pending",
      reasonCode: null,
      deliveryJobId: null,
      appliedAt: null,
    },
    {
      ordinal: 2,
      paymentId: "33333333-3333-4333-8333-333333333333",
      bankReference: "BANK-2",
      amountCents: 20000,
      status: "conflict",
      reasonCode: "version_changed",
      deliveryJobId: null,
      appliedAt: "2026-09-28T00:01:00.000Z",
    },
  ],
};

test("finance match review exposes only per-pending-item confirmed action and downloadable results", () => {
  const html = renderToStaticMarkup(
    <BankMatchOperationReview operation={operation} onApply={() => {}} pendingOrdinal={null} />,
  );
  expect(html).toContain("逐組確認");
  expect(html).toContain("BANK-1");
  expect(html).toContain("BANK-2");
  expect(html).toContain("version_changed");
  expect(html.match(/確認此筆入帳/g)).toHaveLength(1);
  expect(html).toContain("下載逐筆結果 CSV");
  expect(html).toContain(operation.fileSha256);
});
