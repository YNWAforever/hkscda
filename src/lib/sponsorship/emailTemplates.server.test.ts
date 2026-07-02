import { describe, expect, test } from "bun:test";

import { renderPledgeConfirmationEmail } from "./emailTemplates.server";

describe("renderPledgeConfirmationEmail", () => {
  test("renders zh-HK pending_payment email with payment instructions", () => {
    const email = renderPledgeConfirmationEmail({
      language: "zh-HK",
      supporterName: "陳小姐",
      reference: "SP-ABCDEF12",
      amountCents: 30000,
      status: "pending_payment",
    });
    expect(email.subject).toContain("SP-ABCDEF12");
    expect(email.html).toContain("陳小姐");
    expect(email.html).toContain("SP-ABCDEF12");
    expect(email.html).toContain("HK$300");
    expect(email.html).toContain("轉數快");
  });

  test("renders en provisional email without payment instructions", () => {
    const email = renderPledgeConfirmationEmail({
      language: "en",
      supporterName: "Ms. Chan",
      reference: "SP-ABCDEF12",
      amountCents: 30000,
      status: "provisional",
    });
    expect(email.subject).toContain("SP-ABCDEF12");
    expect(email.html).toContain("Ms. Chan");
    expect(email.html).not.toContain("FPS");
  });

  test("HTML-escapes the supporter name", () => {
    const email = renderPledgeConfirmationEmail({
      language: "en",
      supporterName: "<script>alert(1)</script>",
      reference: "SP-ABCDEF12",
      amountCents: 10000,
      status: "pending_payment",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
