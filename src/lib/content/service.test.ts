import { describe, expect, test } from "bun:test";
import { createContentService, type ContentRepository } from "./service";
import type { ContentDetail, StoryUpdate } from "./types";

const storyUpdateId = "22222222-2222-4333-8444-555555555555";
const missingStoryUpdateId = "33333333-3333-4333-8444-555555555555";

const publicStoryUpdate: StoryUpdate = {
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
};

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
    upsertStoryProfile: async () => detail,
    createStoryUpdate: async () => storyUpdateId,
    createContentMedia: async () => "media-2",
    createContentLink: async () => "link-1",
    insertSocialCopies: async (rows) => {
      socialCopies.push(...rows);
    },
    getStoryUpdate: async (id) => (id === storyUpdateId ? publicStoryUpdate : null),
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

  test("validates direct content updates that try to publish", async () => {
    let updateCalled = false;
    const { repo } = createRepo({
      getAdminContent: async () => ({ ...detail, coverMediaId: null, coverImageUrl: null }),
      updateContent: async () => {
        updateCalled = true;
        return detail;
      },
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.updateContent({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: { status: "published" },
      }),
    ).rejects.toMatchObject({
      name: "ContentValidationError",
      issues: [
        {
          field: "coverMediaId",
          message: "Cover image is required before publishing",
        },
      ],
    });
    expect(updateCalled).toBe(false);
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

  test("rejects social copy generation for internal story updates", async () => {
    const { repo, socialCopies } = createRepo({
      getStoryUpdate: async () => ({ ...publicStoryUpdate, visibility: "internal" }),
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.generateSocialCopy({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: { storyUpdateId },
      }),
    ).rejects.toThrow("Internal story updates cannot generate outbound content");
    expect(socialCopies).toEqual([]);
  });

  test("rejects adopter notification drafts for internal story updates", async () => {
    const { repo, notificationDrafts } = createRepo({
      getStoryUpdate: async () => ({ ...publicStoryUpdate, visibility: "internal" }),
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.generateNotificationDrafts({
        actorUserId: "admin-user",
        storyUpdateId,
      }),
    ).rejects.toThrow("Internal story updates cannot generate outbound content");
    expect(notificationDrafts).toEqual([]);
  });

  test("upserts Story Wall settings and audits the profile change", async () => {
    const { repo, auditLogs } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await service.upsertStoryProfile({
      actorUserId: "admin-user",
      contentId: "content-1",
      input: {
        animalType: "cat",
        publicStatus: "medical_care",
        rescueRegion: "灣仔",
        rescueDate: "2026-07-01",
        showOnMap: true,
        publicMapLabel: "灣仔區",
        publicLat: 22.277,
        publicLng: 114.173,
        internalAddress: "internal address",
        internalLocationNotes: "internal notes",
        isFeatured: true,
      },
    });

    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: "content.story_profile.upsert",
        entity: "rescue_story_profile",
        entity_id: "content-1",
      }),
    );
  });

  test("creates story updates, media, and linked records with audit logs", async () => {
    const { repo, auditLogs } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.createStoryUpdate({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          kind: "medical",
          title: "覆診完成",
          body: "小白情況穩定。",
          occurredAt: "2026-07-05T10:00:00.000Z",
          visibility: "public",
          shouldGenerateAdopterDrafts: true,
        },
      }),
    ).resolves.toEqual({ id: storyUpdateId });
    await expect(
      service.createContentMedia({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          storyUpdateId,
          storageBucket: "content-media",
          storagePath: "stories/siu-bak/checkup.jpg",
          altText: "小白覆診照片",
          caption: "覆診完成",
          sortOrder: 1,
          isCover: true,
        },
      }),
    ).resolves.toEqual({ id: "media-2" });
    await expect(
      service.createContentLink({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          linkedType: "adoption_case",
          linkedId: "44444444-4444-4333-8444-555555555555",
          relationship: "adopter",
        },
      }),
    ).resolves.toEqual({ id: "link-1" });

    expect(auditLogs.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "content.story_update.create",
        "content.media.create",
        "content.link.create",
      ]),
    );
  });
});
