import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ReminderDraftPreview } from "./ReminderDraftPanel";

test("staff preview labels recipient and internal ledger amount without a send action", () => {
  const html = renderToStaticMarkup(
    <ReminderDraftPreview
      result={{
        kind: "draft",
        recipient: { name: "Alex", email: "alex@example.invalid" },
        periodMonth: "2026-08-01",
        outstandingCents: 12_345,
        generatedAt: "2026-09-28T02:00:00.000Z",
        subject: "Sponsorship record follow-up: 2026-08",
        body: "Dear Alex, please share your payment reference.",
      }}
    />,
  );
  expect(html).toContain("alex@example.invalid");
  expect(html).toContain("2026-08");
  expect(html).toContain("123.45");
  expect(html).toContain("只供內部審閱");
  expect(html.toLowerCase()).toContain("readonly");
  expect(html).not.toContain("發送提醒");
});

test("unavailable preview explains pending proof instead of showing an email", () => {
  const html = renderToStaticMarkup(
    <ReminderDraftPreview result={{ kind: "unavailable", reason: "proof_pending" }} />,
  );
  expect(html).toContain("付款憑證待核實");
  expect(html).not.toContain("mailto:");
});
