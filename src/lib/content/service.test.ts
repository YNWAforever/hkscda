import { describe, expect, test } from "bun:test";
import { createContentService, type ContentRepository } from "./service";
import type { ContentDetail } from "./types";

const storyUpdateId = "22222222-2222-4333-8444-555555555555";
const missingStoryUpdateId = "33333333-3333-4333-8444-555555555555";

const detail: ContentDetail = {
  id: "content-1",
  slug: "siu-bak-recovery",
  type: "rescue_story",
  title: "小白康復中",
  subtitle: null,
  summary: "小白正在康復。",
  body: "救援故事正文",
  coverMediaId: "media-1",
  coverImageUrl: "https://example.test/cover.jpg",
  status: "draft",
  publishedAt: "2026-07-05T10:00:00.000Z",
  ctaLabel: "支持救援",
  ctaUrl: "/donate",
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  storyProfile: {
    contentItemId: "content-1",
    animalType: "cat",
    publicStatus: "medical_care",
    rescueRegion: "灣仔",
    rescueDate: "2026-07-01",
    showOnMap: false,
    publicMapLabel: null,
    publicLat: null,
    publicLng: null,
    internalAddress: null,
    internalLocationNotes: null,
    isFeatured: true,
  },
  latestPublicUpdate: null,
  links: [],
  media: [],
  updates: [],
  socialCopies: [],
  notificationDrafts: [],
  createdAt: "2026-07-05T09:00:00.000Z",
  updatedAt: "2026-07-05T09:00:00.000Z",
};

function createRepo(overrides: Partial<ContentRepository> = {}) {
  const auditLogs: Parameters<ContentRepository["insertAuditLog"]>[0][] = [];
  const socialCopies: Parameters<ContentRepository["insertSocialCopies"]>[0] = [];
  const notificationDrafts: Parameters<ContentRepository["insertNotificationDrafts"]>[0] = [];

  const repo: ContentRepository = {
    listPublicContent: async () => ({ items: [detail], total: 1 }),
    getPublicContentBySlug: async () => detail,
    listPublicMapStories: async () => [],
    listAdminContent: async () => ({ items: [detail], total: 1 }),
    getAdminContent: async () => detail,
    createContent: async () => "content-1",
    updateContent: async () => detail,
    publishContent: async () => ({ ...detail, status: "published" }),
    archiveContent: async () => ({ ...detail, status: "archived" }),
    insertSocialCopies: async (rows) => {
      socialCopies.push(...rows);
    },
    getStoryUpdate: async (id) =>
      id === storyUpdateId
        ? {
            id: storyUpdateId,
            contentItemId: "content-1",
            kind: "medical",
            title: "已完成疫苗接種",
            body: "小白現於暫養家庭康復中。",
            occurredAt: "2026-07-05T10:00:00.000Z",
            visibility: "public",
            shouldGenerateAdopterDrafts: true,
            media: [],
            createdAt: "2026-07-05T10:00:00.000Z",
            updatedAt: "2026-07-05T10:00:00.000Z",
          }
        : null,
    resolveAdopterRecipients: async () => [
      {
        adoptionCaseId: "case-1",
        supporterId: "supporter-1",
        name: "陳小姐",
        email: "ada@example.com",
        phone: "91234567",
      },
    ],
    insertNotificationDrafts: async (rows) => {
      notificationDrafts.push(...rows);
    },
    updateNotificationDraftStatus: async () => undefined,
    updateSocialCopyStatus: async () => undefined,
    insertAuditLog: async (row) => {
      auditLogs.push(row);
    },
    ...overrides,
  };

  return { repo, auditLogs, socialCopies, notificationDrafts };
}

describe("createContentService", () => {
  test("blocks publishing invalid content with field-level issues", async () => {
    const { repo } = createRepo({
      getAdminContent: async () => ({ ...detail, coverMediaId: null, coverImageUrl: null }),
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.publishContent({ actorUserId: "admin-user", contentId: "content-1" }),
    ).rejects.toMatchObject({
      name: "ContentValidationError",
      issues: [
        {
          field: "coverMediaId",
          message: "Cover image is required before publishing",
        },
      ],
    });
  });

  test("publishes valid content and audits the action", async () => {
    const { repo, auditLogs } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    const published = await service.publishContent({
      actorUserId: "admin-user",
      contentId: "content-1",
    });

    expect(published.status).toBe("published");
    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        actor_user_id: "admin-user",
        action: "content.publish",
        entity: "content_item",
        entity_id: "content-1",
      }),
    );
  });

  test("generates social copy and adopter notification drafts", async () => {
    const { repo, socialCopies, notificationDrafts } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await service.generateSocialCopy({
      actorUserId: "admin-user",
      contentId: "content-1",
      input: { storyUpdateId },
    });
    await service.generateNotificationDrafts({
      actorUserId: "admin-user",
      storyUpdateId,
    });

    expect(socialCopies).toHaveLength(3);
    expect(notificationDrafts).toHaveLength(2);
  });

  test("rejects invalid social copy story update ids", async () => {
    const { repo } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.generateSocialCopy({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: { storyUpdateId: "update-1" },
      }),
    ).rejects.toThrow();
  });

  test("rejects social copy generation when story update is not found", async () => {
    const { repo } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.generateSocialCopy({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: { storyUpdateId: missingStoryUpdateId },
      }),
    ).rejects.toThrow("Story update not found");
  });

  test("rejects social copy generation for another content item's update", async () => {
    const { repo } = createRepo({
      getStoryUpdate: async () => ({
        id: storyUpdateId,
        contentItemId: "content-2",
        kind: "medical",
        title: "已完成疫苗接種",
        body: "小白現於暫養家庭康復中。",
        occurredAt: "2026-07-05T10:00:00.000Z",
        visibility: "public",
        shouldGenerateAdopterDrafts: true,
        media: [],
        createdAt: "2026-07-05T10:00:00.000Z",
        updatedAt: "2026-07-05T10:00:00.000Z",
      }),
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.generateSocialCopy({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: { storyUpdateId },
      }),
    ).rejects.toThrow("Story update does not belong to this content item");
  });
});
