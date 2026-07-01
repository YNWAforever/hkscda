import { describe, expect, test } from "bun:test";

import { renderAdoptionConfirmationEmail } from "./emailTemplates.server";

describe("renderAdoptionConfirmationEmail", () => {
  test("renders Traditional Chinese confirmation with status link", () => {
    const email = renderAdoptionConfirmationEmail({
      language: "zh-HK",
      applicantName: "Ada",
      reference: "APP-ABC123",
      statusUrl: "https://example.test/adoption/status/token",
      expiresAt: "2026-08-01T00:00:00.000Z",
    });
    expect(email.subject).toBe("HKSCDA 已收到您的領養申請 APP-ABC123");
    expect(email.html).toContain("Ada");
    expect(email.html).toContain("https://example.test/adoption/status/token");
  });

  test("renders English confirmation", () => {
    const email = renderAdoptionConfirmationEmail({
      language: "en",
      applicantName: "Ada",
      reference: "APP-ABC123",
      statusUrl: "https://example.test/adoption/status/token",
      expiresAt: "2026-08-01T00:00:00.000Z",
    });
    expect(email.subject).toBe("HKSCDA received your adoption application APP-ABC123");
    expect(email.html).toContain("Your status link expires on 2026-08-01");
  });

  test("escapes interpolated fields", () => {
    const email = renderAdoptionConfirmationEmail({
      language: "en",
      applicantName: "<Ada>",
      reference: "APP-&123",
      statusUrl: "https://example.test/status?token=<bad>&x=1",
      expiresAt: "2026-08-01T00:00:00.000Z",
    });

    expect(email.subject).toBe("HKSCDA received your adoption application APP-&123");
    expect(email.html).toContain("&lt;Ada&gt;");
    expect(email.html).toContain("https://example.test/status?token=&lt;bad&gt;&amp;x=1");
    expect(email.html).not.toContain("<Ada>");
  });
});
