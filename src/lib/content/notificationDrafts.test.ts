import { describe, expect, test } from "bun:test";
import { buildAdopterNotificationDrafts } from "./notificationDrafts";

describe("buildAdopterNotificationDrafts", () => {
  test("deduplicates duplicate recipients into email and WhatsApp drafts", () => {
    const drafts = buildAdopterNotificationDrafts({
      contentItemId: "content-1",
      storyUpdateId: "update-1",
      storyTitle: "小白康復中",
      updateTitle: "已完成疫苗接種",
      updateBody: "小白現於暫養家庭康復中。",
      publicUrl: "https://hkscda.org/stories/siu-bak-recovery",
      recipients: [
        {
          adoptionCaseId: "case-1",
          supporterId: "supporter-1",
          name: "陳小姐",
          email: "ada@example.com",
          phone: "91234567",
        },
        {
          adoptionCaseId: "case-1",
          supporterId: "supporter-1",
          name: "陳小姐",
          email: "ada@example.com",
          phone: "91234567",
        },
      ],
    });

    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.channel)).toEqual(["email", "whatsapp"]);
    expect(drafts[0]).toMatchObject({
      contentItemId: "content-1",
      storyUpdateId: "update-1",
      adoptionCaseId: "case-1",
      supporterId: "supporter-1",
      recipientName: "陳小姐",
      recipientContact: "ada@example.com",
      status: "draft",
    });
    expect(drafts[0].body).toContain("已完成疫苗接種");
    expect(drafts[0].body).toContain("https://hkscda.org/stories/siu-bak-recovery");
  });
});
