import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ManualGiftOutcome } from "./ManualGiftOutcome";
const common = {
  language: "zh" as const,
  donationId: "synthetic-gift",
  onRetry: () => {},
  onDone: () => {},
  retrying: false,
};
test("committed pending gift displays saved state and delivery-only retry", () => {
  const html = renderToStaticMarkup(<ManualGiftOutcome {...common} deliveryStatus="retryable" />);
  expect(html).toContain("捐款已儲存");
  expect(html).toContain("重試收據及確認電郵");
  expect(html).not.toContain("儲存手動捐款");
});
test("completed gift cannot be resent from outcome", () => {
  const html = renderToStaticMarkup(<ManualGiftOutcome {...common} deliveryStatus="complete" />);
  expect(html).toContain("電郵服務已接納");
  expect(html).not.toContain("重試收據及確認電郵");
});
