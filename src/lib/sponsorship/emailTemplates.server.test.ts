import { describe, expect, test } from "bun:test";

import { renderPledgeConfirmationEmail } from "./emailTemplates.server";

describe("renderPledgeConfirmationEmail", () => {
  test("renders zh-HK pending_payment email with payment instructions and status link", () => {
    const email = renderPledgeConfirmationEmail({
      language: "zh-HK",
      supporterName: "陳小姐",
      reference: "SP-ABCDEF12",
      amountCents: 30000,
      status: "pending_payment",
      statusUrl: "https://hkscda.com/sponsors/status/raw-token",
    });
    expect(email.subject).toContain("SP-ABCDEF12");
    expect(email.html).toContain("陳小姐");
    expect(email.html).toContain("SP-ABCDEF12");
    expect(email.html).toContain("HK$300");
    expect(email.html).toContain("轉數快");
    expect(email.html).toContain("https://hkscda.com/sponsors/status/raw-token");
    expect(email.html).toContain("查看助養狀態");
  });

  test("renders en provisional email without payment instructions but with status link", () => {
    const email = renderPledgeConfirmationEmail({
      language: "en",
      supporterName: "Ms. Chan",
      reference: "SP-ABCDEF12",
      amountCents: 30000,
      status: "provisional",
      statusUrl: "https://hkscda.com/sponsors/status/raw-token",
    });
    expect(email.subject).toContain("SP-ABCDEF12");
    expect(email.html).toContain("Ms. Chan");
    expect(email.html).not.toContain("FPS");
    expect(email.html).toContain("View sponsorship status");
  });

  test("HTML-escapes the supporter name and the status URL", () => {
    const email = renderPledgeConfirmationEmail({
      language: "en",
      supporterName: "<script>alert(1)</script>",
      reference: "SP-ABCDEF12",
      amountCents: 10000,
      status: "pending_payment",
      statusUrl: 'https://hkscda.com/sponsors/status/"><script>alert(2)</script>',
    });
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<script>alert(2)</script>");
  });
});
