import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SupporterActivitySummary } from "./SupporterActivitySummary";

describe("SupporterActivitySummary", () => {
  test("renders CRM and adoption counters", () => {
    const markup = renderToStaticMarkup(
      <SupporterActivitySummary
        language="en"
        lifetimeAmountCents={123400}
        donationCount={4}
        receiptCount={2}
        pendingPaymentCount={1}
        adoptionCaseCount={3}
        openFollowupCount={2}
        successfulAdoptionCount={1}
      />,
    );

    expect(markup).toContain("HK$1,234");
    expect(markup).toContain("Donations");
    expect(markup).toContain("Open follow-ups");
    expect(markup).toContain("Successful adoptions");
  });
});
