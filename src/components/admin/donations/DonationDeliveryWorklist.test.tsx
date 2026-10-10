import { expect, test } from "bun:test";

import type { DeliveryWorklistResult } from "../../../lib/donations/deliveryWorklist";
import { renderAdminInChinese } from "../i18n/testing";
import { DonationDeliveryWorklistView } from "./DonationDeliveryWorklist";

function result(status: "succeeded" | "refunded"): DeliveryWorklistResult {
  return {
    page: 1,
    pageSize: 25,
    total: 1,
    jobs: [
      {
        id: "11111111-2222-4333-8444-555555555555",
        paymentId: "22222222-3333-4444-8555-666666666666",
        status: "attention_required",
        attempts: 2,
        errorCode: "provider_error",
        createdAt: "2026-09-28T00:00:00Z",
        nextAttemptAt: null,
        paymentStatus: status,
        donationStatus: status,
      },
    ],
  };
}

test("failed receipt job is inspectable but only succeeded payment offers per-item retry", () => {
  const paid = renderAdminInChinese(
    <DonationDeliveryWorklistView
      result={result("succeeded")}
      retryingId={null}
      onRetry={() => {}}
    />,
  );
  expect(paid).toContain("provider_error");
  expect(paid).toContain("22222222-3333-4444-8555-666666666666");
  expect(paid).toContain("重試此工作");
  expect(paid).not.toContain("批量重試");
  const refunded = renderAdminInChinese(
    <DonationDeliveryWorklistView
      result={result("refunded")}
      retryingId={null}
      onRetry={() => {}}
    />,
  );
  expect(refunded).not.toContain("重試此工作");
});
