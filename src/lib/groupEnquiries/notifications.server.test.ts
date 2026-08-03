import { describe, expect, test } from "bun:test";

import { notifyGroupEnquiryAdmins } from "./notifications.server";
import type { GroupEnquiry } from "./types";

const enquiry: GroupEnquiry = {
  id: "enquiry-1",
  organisationName: "<Happy & School>",
  contactPerson: "Ms <Chan>",
  email: "lead@example.com",
  phone: "91234567",
  activityType: "other",
  otherActivityDescription: "<script>alert(1)</script>",
  participantCount: 30,
  participantAgeProfile: "P4-P6",
  preferredDateNotes: "Friday afternoons",
  message: "Use <b>care</b>",
  status: "new",
  notificationStatus: "pending",
  notificationError: null,
  assignedTo: null,
  adminNotes: null,
  idempotencyKey: "11111111-2222-4333-8444-555555555555",
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};

describe("group enquiry admin notifications", () => {
  test("escapes submitted fields before sending admin email", async () => {
    const sent: unknown[] = [];
    const result = await notifyGroupEnquiryAdmins(
      { enquiry },
      {
        getEmailConfig: () => ({ resendApiKey: "key", from: "HKSCDA <noreply@example.test>", replyTo: "admin@example.test" }),
        createEmailSender: async () => ({ send: async (input: unknown) => sent.push(input) }),
      },
    );

    expect(result).toBe("sent");
    expect(sent).toHaveLength(1);
    const html = String((sent[0] as { html: string }).html);
    expect(html).toContain("&lt;Happy &amp; School&gt;");
    expect(html).not.toContain("<script>");
  });

  test("skips when outbound admin email is not configured and reports failures safely", async () => {
    await expect(
      notifyGroupEnquiryAdmins(
        { enquiry },
        { getEmailConfig: () => ({ resendApiKey: null, from: "noreply@example.test", replyTo: null }) },
      ),
    ).resolves.toBe("skipped");

    await expect(
      notifyGroupEnquiryAdmins(
        { enquiry },
        {
          getEmailConfig: () => ({ resendApiKey: "key", from: "noreply@example.test", replyTo: "admin@example.test" }),
          createEmailSender: async () => ({ send: async () => { throw new Error("SMTP down"); } }),
          logger: { error: () => undefined },
        },
      ),
    ).resolves.toBe("failed");
  });
});
