import { describe, expect, test } from "bun:test";

import {
  renderPledgeConfirmationEmail,
  renderPledgeStatusUpdateEmail,
} from "./emailTemplates.server";

describe("renderPledgeConfirmationEmail", () => {
  test("renders zh-HK pending_payment email with payment instructions and status link", () => {
    const email = renderPledgeConfirmationEmail({
      language: "zh-HK",
      supporterName: "陳小姐",
      reference: "SP-ABCDEF12",
      amountCents: 30000,
      status: "pending_payment",
      statusUrl: "https://hkscda.com/sponsors/status/raw-token",
      paymentInstructions: [
        {
          instructionsActive: true,
          snapshot: {
            configId: "9a78c87c-1e3a-4c02-b551-71a9b69a5412",
            configVersion: 2,
            purpose: "sponsorship",
            method: "fps",
            displayLabelZh: "轉數快 FPS",
            displayLabelEn: "FPS",
            details: { payableTo: "Synthetic charity", identifier: "FPS TEST-123" },
            capturedAt: "2026-09-27T00:00:00Z",
          },
        },
      ],
    });
    expect(email.subject).toContain("SP-ABCDEF12");
    expect(email.html).toContain("陳小姐");
    expect(email.html).toContain("SP-ABCDEF12");
    expect(email.html).toContain("HK$300");
    expect(email.html).toContain("轉數快");
    expect(email.html).toContain("FPS TEST-123");
    expect(email.html).toContain("Synthetic charity");
    expect(email.html).not.toContain("8727588");
    expect(email.html).not.toContain("124-511320-838");
    expect(email.html).not.toContain("012-345-678901");
    expect(email.html).not.toContain("@hkscda");
    expect(email.html).toContain("https://hkscda.com/sponsors/status/raw-token");
    expect(email.html).toContain("查看助養狀態");
  });

  test("pending email without approved instructions requests staff verification and exposes no legacy account", () => {
    const email = renderPledgeConfirmationEmail({
      language: "zh-HK",
      supporterName: "陳小姐",
      reference: "SP-ABCDEF12",
      amountCents: 30000,
      status: "pending_payment",
      statusUrl: "https://hkscda.com/sponsors/status/raw-token",
    });
    expect(email.html).toContain("聯絡");
    expect(email.html).not.toContain("8727588");
    expect(email.html).not.toContain("124-511320-838");
    expect(email.html).not.toContain("goo.gl");
  });

  test("escapes approved account details in the email body", () => {
    const email = renderPledgeConfirmationEmail({
      language: "en",
      supporterName: "Synthetic",
      reference: "SP-TEST",
      amountCents: 30000,
      status: "pending_payment",
      statusUrl: "https://example.test/status",
      paymentInstructions: [
        {
          instructionsActive: true,
          snapshot: {
            configId: "9a78c87c-1e3a-4c02-b551-71a9b69a5412",
            configVersion: 2,
            purpose: "sponsorship",
            method: "fps",
            displayLabelZh: "轉數快 FPS",
            displayLabelEn: "FPS",
            details: { payableTo: "<img src=x>", identifier: "FPS <script>" },
            capturedAt: "2026-09-27T00:00:00Z",
          },
        },
      ],
    });
    expect(email.html).not.toContain("<img src=x>");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;img src=x&gt;");
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

describe("renderPledgeStatusUpdateEmail", () => {
  function baseInput(overrides: Record<string, unknown> = {}) {
    return {
      event: "active" as const,
      language: "zh-HK" as const,
      supporterName: "陳小姐",
      reference: "SP-ABCDEF12",
      amountCents: 30000,
      ...overrides,
    };
  }

  test("renders the proof_recorded event bilingually", () => {
    const zh = renderPledgeStatusUpdateEmail(baseInput({ event: "proof_recorded" }));
    expect(zh.subject).toContain("SP-ABCDEF12");
    expect(zh.html).toContain("陳小姐");

    const en = renderPledgeStatusUpdateEmail(
      baseInput({ event: "proof_recorded", language: "en", supporterName: "Ms. Chan" }),
    );
    expect(en.html).toContain("Ms. Chan");
  });

  test("renders the active event", () => {
    const email = renderPledgeStatusUpdateEmail(baseInput({ event: "active" }));
    expect(email.html).toContain("HK$300");
  });

  test("renders the needs_followup event with a mailto fallback", () => {
    const zh = renderPledgeStatusUpdateEmail(baseInput({ event: "needs_followup" }));
    expect(zh.html).toContain("mailto:");
    expect(zh.html).toContain("SP-ABCDEF12");

    const en = renderPledgeStatusUpdateEmail(
      baseInput({ event: "needs_followup", language: "en" }),
    );
    expect(en.html).toContain("mailto:");
  });

  test("renders the cancelled event", () => {
    const email = renderPledgeStatusUpdateEmail(baseInput({ event: "cancelled" }));
    expect(email.subject).toContain("SP-ABCDEF12");
  });

  test("escapes HTML in supporter name and reference", () => {
    const email = renderPledgeStatusUpdateEmail(
      baseInput({ supporterName: "<script>alert(1)</script>", reference: "SP-<b>X</b>" }),
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  test("throws for an event value outside the known union, in both languages", () => {
    expect(() => renderPledgeStatusUpdateEmail(baseInput({ event: "bogus" }))).toThrow(
      "Unhandled pledge status update event: bogus",
    );
    expect(() =>
      renderPledgeStatusUpdateEmail(baseInput({ event: "bogus", language: "en" })),
    ).toThrow("Unhandled pledge status update event: bogus");
  });
});
