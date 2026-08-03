import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { SupporterDetail } from "../../../lib/crm/types";
import { SupporterProfileSidebar } from "./SupporterProfileSidebar";

function supporter(overrides: Partial<SupporterDetail> = {}): SupporterDetail {
  return {
    id: "supporter-1",
    name: "Ada",
    email: "ada@example.com",
    phone: "9123 4567",
    language: "zh-HK",
    tags: ["demo"],
    roles: ["adopter", "volunteer"],
    deletedAt: null,
    lastGiftAt: null,
    lastGiftAmountCents: null,
    lifetimeAmountCents: 0,
    donationCount: 0,
    receiptNeeded: false,
    emailConsent: "opt_in",
    whatsappConsent: "opt_out",
    source: "admin",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-02T10:00:00.000Z",
    donations: [],
    payments: [],
    receipts: [],
    consents: [],
    volunteer: { registrations: [] },
    messages: [],
    auditLogs: [],
    timeline: [],
    adoption: {
      profiles: [
        {
          id: "profile-1",
          displayName: "黃雅達 / Ada Wong",
          email: "ada@example.com",
          phone: "9123 4567",
          livingArea: "香港島",
          isBlacklisted: false,
          birthday: "1990-01-01",
          address: "HK Island",
          householdSize: "3",
          blacklistReason: null,
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-02T10:00:00.000Z",
        },
      ],
      cases: [],
      followups: [],
      successfulAdoptions: [],
    },
    ...overrides,
  };
}

describe("SupporterProfileSidebar", () => {
  test("renders contact, consent, roles, and linked adopter profile", () => {
    const markup = renderToStaticMarkup(
      <SupporterProfileSidebar
        supporter={supporter()}
        language="zh"
        roleLabels={{ donor: "捐款人", adopter: "領養人", volunteer: "義工", foster: "暫托" }}
      />,
    );

    expect(markup).toContain("Ada");
    expect(markup).toContain("ada@example.com");
    expect(markup).toContain("領養人");
    expect(markup).toContain("義工");
    expect(markup).toContain("黃雅達 / Ada Wong");
    expect(markup).toContain("香港島");
  });

  test("renders quiet empty adoption text when no profile is linked", () => {
    const markup = renderToStaticMarkup(
      <SupporterProfileSidebar
        supporter={supporter({
          adoption: { profiles: [], cases: [], followups: [], successfulAdoptions: [] },
        })}
        language="en"
        roleLabels={{
          donor: "Donor",
          adopter: "Adopter",
          volunteer: "Volunteer",
          foster: "Foster",
        }}
      />,
    );

    expect(markup).toContain("No linked adoption history.");
  });
});
