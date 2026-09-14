import { describe, expect, mock, test } from "bun:test";
import type { AdopterNotificationRecipient } from "./notificationDrafts";
import { createContentService, type ContentRepository } from "./service";
import type { ContentDetail, RecipientNotificationDraft, StoryUpdate } from "./types";

type ContentService = ReturnType<typeof createContentService>;

type ContentOverride = Partial<ContentDetail>;

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
    listPublicStoriesPage: async () => ({ items: [detail], total: 1, points: [] }),
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
    createSignedUploadUrl: async (objectPath) => ({ token: "upload-token", path: objectPath }),
    createContentLink: async () => "link-1",
    insertSocialCopies: async (rows) => {
      socialCopies.push(...rows);
    },
    getStoryUpdate: async (id) => (id === storyUpdateId ? publicStoryUpdate : null),
    listNotificationDraftKeys: async () => [],
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

function buildService({
  content,
  storyUpdate,
  recipients,
  recipientsError,
  draftKeys,
  insertNotificationDrafts,
  mediaLifecycle,
}: {
  content?: ContentOverride;
  storyUpdate?: Partial<StoryUpdate>;
  recipients?: AdopterNotificationRecipient[];
  recipientsError?: Error;
  draftKeys?: Array<{ channel: string; recipientContact: string }>;
  insertNotificationDrafts?: ContentRepository["insertNotificationDrafts"];
  mediaLifecycle?: {
    publish: (command: unknown) => Promise<{ version: number; revisionId: string }>;
  };
} = {}) {
  const overrides: Partial<ContentRepository> = {
    getAdminContent: async () => ({ ...detail, ...content }) as ContentDetail,
  };
  if (storyUpdate) {
    const update: StoryUpdate = { ...publicStoryUpdate, ...storyUpdate };
    overrides.getStoryUpdate = async () => update;
    overrides.createStoryUpdate = mock(async () => update.id);
  }
  if (recipientsError) {
    overrides.resolveAdopterRecipients = async () => {
      throw recipientsError;
    };
  } else if (recipients) {
    overrides.resolveAdopterRecipients = async () => recipients;
  }
  if (draftKeys) {
    overrides.listNotificationDraftKeys = async () => draftKeys;
  }
  if (insertNotificationDrafts) {
    overrides.insertNotificationDrafts = insertNotificationDrafts;
  }

  const { repo } = createRepo(overrides);
  const service: ContentService = createContentService({
    repo,
    publicBaseUrl: "https://example.test",
    mediaLifecycle: mediaLifecycle as unknown as Parameters<
      typeof createContentService
    >[0]["mediaLifecycle"],
  });
  return { service, repo };
}

describe("createContentService", () => {
  test("rejects an explicit published status before creating content", async () => {
    let createCalled = false;
    const { repo } = createRepo({
      createContent: async () => {
        createCalled = true;
        return "content-1";
      },
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.createContent({
        actorUserId: "admin-user",
        input: {
          type: "rescue_story",
          slug: "missing-publish-prerequisites",
          title: "Missing prerequisites",
          summary: "No cover image or story profile exists.",
          status: "published",
        },
      }),
    ).rejects.toThrow("Content items must be created as drafts");
    expect(createCalled).toBe(false);
  });

  test("creates draft content when status is omitted", async () => {
    let persistedStatus: string | undefined;
    const { repo } = createRepo({
      createContent: async (input) => {
        persistedStatus = input.status;
        return "content-1";
      },
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.createContent({
        actorUserId: "admin-user",
        input: {
          type: "rescue_story",
          slug: "new-rescue-story",
          title: "New rescue story",
          summary: "Draft story summary.",
        },
      }),
    ).resolves.toEqual({ id: "content-1" });
    expect(persistedStatus).toBe("draft");
  });

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

  test("treats an unpublished public detail as not found", async () => {
    const { repo } = createRepo({
      getPublicContentBySlug: async () => ({ ...detail, status: "draft" }),
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    expect(await service.getPublicContentBySlug("siu-bak-recovery")).toBeNull();
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

  test("publishContent returns field-level issues for an incomplete draft", async () => {
    const publish = mock(async () => ({ version: 1, revisionId: "r1" }));
    const { service } = buildService({
      content: { summary: "", coverMediaId: null, coverImageUrl: null },
      mediaLifecycle: { publish },
    });

    await expect(
      service.publishContent({ actorUserId: "u1", contentId: "content-1", input: {} }),
    ).rejects.toMatchObject({
      name: "ContentValidationError",
      issues: expect.arrayContaining([expect.objectContaining({ field: "summary" })]),
    });
    expect(publish).not.toHaveBeenCalled();
  });

  test("publishContent publishes a complete draft", async () => {
    const publish = mock(async () => ({ version: 2, revisionId: "r2" }));
    const { service } = buildService({
      content: {},
      mediaLifecycle: { publish },
    });

    await service.publishContent({ actorUserId: "u1", contentId: "content-1", input: {} });

    expect(publish).toHaveBeenCalled();
  });

  test("sets published_at before a legacy publish that lacks it", async () => {
    const updates: Parameters<ContentRepository["updateContent"]>[1][] = [];
    const { repo } = createRepo({
      getAdminContent: async () => ({ ...detail, publishedAt: null }),
      updateContent: async (_id, input) => {
        updates.push(input);
        return { ...detail, publishedAt: input.publishedAt ?? null };
      },
    });
    const publishedIds: string[] = [];
    repo.publishContent = async (id) => {
      publishedIds.push(id);
      return { ...detail, status: "published" };
    };
    const service = createContentService({
      repo,
      publicBaseUrl: "https://example.test",
      now: () => new Date("2026-07-06T00:00:00.000Z"),
    });

    await service.publishContent({ actorUserId: "admin-user", contentId: "content-1" });

    expect(updates).toEqual([{ publishedAt: "2026-07-06T00:00:00.000Z" }]);
    expect(publishedIds).toEqual(["content-1"]);
  });

  test("does not overwrite an existing published_at on a legacy publish", async () => {
    let updateCalled = false;
    const { repo } = createRepo({
      updateContent: async () => {
        updateCalled = true;
        return detail;
      },
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await service.publishContent({ actorUserId: "admin-user", contentId: "content-1" });

    expect(updateCalled).toBe(false);
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

  test("sets published_at when a direct update publishes content without it", async () => {
    const updates: Parameters<ContentRepository["updateContent"]>[1][] = [];
    const { repo } = createRepo({
      getAdminContent: async () => ({ ...detail, status: "draft", publishedAt: null }),
      updateContent: async (_id, input) => {
        updates.push(input);
        return { ...detail, status: "published", publishedAt: input.publishedAt ?? null };
      },
    });
    const service = createContentService({
      repo,
      publicBaseUrl: "https://example.test",
      now: () => new Date("2026-07-06T00:00:00.000Z"),
    });

    await service.updateContent({
      actorUserId: "admin-user",
      contentId: "content-1",
      input: { status: "published" },
    });

    expect(updates).toEqual([{ status: "published", publishedAt: "2026-07-06T00:00:00.000Z" }]);
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

  // Every other mutation on this service audits (content.create, content.publish,
  // content.media.create, ...). These four resolved actorUserId all the way from
  // requireAdmin and then dropped it with `void actorUserId`, so a staff member
  // could draft outbound social copy, generate notification drafts addressed to
  // adopters, and move both toward "sent" without leaving any record of who did it.
  test("audits generated social copy", async () => {
    const { repo, auditLogs } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await service.generateSocialCopy({
      actorUserId: "admin-user",
      contentId: "content-1",
      input: { storyUpdateId },
    });

    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        actor_user_id: "admin-user",
        action: "content.social_copy.generate",
        entity: "social_copy_variant",
        entity_id: "content-1",
      }),
    );
  });

  test("audits social copy status changes", async () => {
    const { repo, auditLogs } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    // "copied" is the outbound moment — staff lifting the text out to post it.
    await service.updateSocialCopyStatus({
      actorUserId: "admin-user",
      copyId: "copy-1",
      input: { status: "copied" },
    });

    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        actor_user_id: "admin-user",
        action: "content.social_copy.status",
        entity: "social_copy_variant",
        entity_id: "copy-1",
        detail: { status: "copied" },
      }),
    );
  });

  test("does not re-draft a delivery target that already has a draft for this update", async () => {
    // The panel's generate button appends on every press. An operator who
    // presses it twice gets two drafts addressed to the same adopter, copies
    // both, and sends the same message to a real person twice.
    //
    // One recipient with an email and a phone is two delivery targets. With the
    // email target already drafted, regenerating should produce the whatsapp
    // one and nothing else.
    const existing: RecipientNotificationDraft = {
      id: "draft-existing",
      storyUpdateId,
      contentItemId: "content-1",
      adoptionCaseId: "case-1",
      supporterId: "supporter-1",
      channel: "email",
      recipientName: "陳小姐",
      recipientContact: "ada@example.com",
      subject: "小白康復中 近況更新：已完成疫苗接種",
      body: "已產生的草稿",
      status: "draft",
      createdAt: "2026-07-05T11:00:00.000Z",
      updatedAt: "2026-07-05T11:00:00.000Z",
    };

    const { repo, notificationDrafts } = createRepo({
      getAdminContent: async () => ({ ...detail, notificationDrafts: [existing] }),
      listNotificationDraftKeys: async () => [
        { channel: "email", recipientContact: "ada@example.com" },
      ],
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    const result = await service.generateNotificationDrafts({
      actorUserId: "admin-user",
      storyUpdateId,
    });

    expect(notificationDrafts).toHaveLength(1);
    expect(notificationDrafts[0]?.channel).toBe("whatsapp");
    expect(notificationDrafts[0]?.recipientContact).toBe("91234567");
    expect(result.count).toBe(1);
  });

  test("dedupes against the full draft-key set, not the 20-row admin window", async () => {
    // getAdminContent slices notificationDrafts to 20 rows, so an update with
    // more than 20 drafts could hide the matching key and re-draft a real
    // person. The repository key lookup returns every draft for this update.
    const window = Array.from({ length: 20 }, (_, index) => ({
      id: `draft-${index}`,
      storyUpdateId: "other-update",
      contentItemId: "content-1",
      adoptionCaseId: "case-1",
      supporterId: "supporter-1",
      channel: "email" as const,
      recipientName: "陳小姐",
      recipientContact: `other-${index}@example.com`,
      subject: null,
      body: "已產生的草稿",
      status: "draft" as const,
      createdAt: "2026-07-05T11:00:00.000Z",
      updatedAt: "2026-07-05T11:00:00.000Z",
    }));
    const { repo, notificationDrafts } = createRepo({
      getAdminContent: async () => ({ ...detail, notificationDrafts: window }),
      listNotificationDraftKeys: async () => [
        { channel: "email", recipientContact: "ada@example.com" },
      ],
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    const result = await service.generateNotificationDrafts({
      actorUserId: "admin-user",
      storyUpdateId,
    });

    expect(notificationDrafts).toHaveLength(1);
    expect(notificationDrafts[0]?.channel).toBe("whatsapp");
    expect(result.count).toBe(1);
  });

  test("still drafts an adopter added since the last generation", async () => {
    // Guard, not a driver: this passed the moment the filter above existed.
    // It is here because the tempting wrong fix — make the whole call a no-op
    // once any draft exists — also satisfies the test above, and would leave
    // newly-adopted animals' families silently never notified.
    const drafted: RecipientNotificationDraft = {
      id: "draft-existing",
      storyUpdateId,
      contentItemId: "content-1",
      adoptionCaseId: "case-1",
      supporterId: "supporter-1",
      channel: "email",
      recipientName: "陳小姐",
      recipientContact: "ada@example.com",
      subject: null,
      body: "已產生的草稿",
      status: "sent_manually",
      createdAt: "2026-07-05T11:00:00.000Z",
      updatedAt: "2026-07-05T11:00:00.000Z",
    };

    const { repo, notificationDrafts } = createRepo({
      getAdminContent: async () => ({ ...detail, notificationDrafts: [drafted] }),
      listNotificationDraftKeys: async () => [
        { channel: "email", recipientContact: "ada@example.com" },
      ],
      resolveAdopterRecipients: async () => [
        {
          adoptionCaseId: "case-1",
          supporterId: "supporter-1",
          name: "陳小姐",
          email: "ada@example.com",
          phone: null,
        },
        {
          adoptionCaseId: "case-2",
          supporterId: "supporter-2",
          name: "李先生",
          email: "lee@example.com",
          phone: null,
        },
      ],
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await service.generateNotificationDrafts({ actorUserId: "admin-user", storyUpdateId });

    expect(notificationDrafts).toHaveLength(1);
    expect(notificationDrafts[0]?.recipientContact).toBe("lee@example.com");
  });

  test("audits generated adopter notification drafts", async () => {
    const { repo, auditLogs } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await service.generateNotificationDrafts({ actorUserId: "admin-user", storyUpdateId });

    // Drafting messages addressed to adopters touches recipient PII — the row
    // count is the part a later reviewer actually needs.
    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        actor_user_id: "admin-user",
        action: "content.notification_draft.generate",
        entity: "recipient_notification_draft",
        entity_id: storyUpdateId,
        detail: { count: 2 },
      }),
    );
  });

  test("audits notification draft status changes", async () => {
    const { repo, auditLogs } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    // sent_manually is the transition that most needs a name attached to it:
    // it asserts a message actually went out to an adopter.
    await service.updateNotificationDraftStatus({
      actorUserId: "admin-user",
      draftId: "draft-1",
      input: { status: "sent_manually" },
    });

    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        actor_user_id: "admin-user",
        action: "content.notification_draft.status",
        entity: "recipient_notification_draft",
        entity_id: "draft-1",
        detail: { status: "sent_manually" },
      }),
    );
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
    ).resolves.toEqual({
      id: storyUpdateId,
      notificationDrafts: { created: 2, warning: null },
    });
    await expect(
      service.createContentMedia({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          storyUpdateId,
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

  test("rejects media registration for an internal story update", async () => {
    let createMediaCalled = false;
    const { repo } = createRepo({
      getStoryUpdate: async () => ({ ...publicStoryUpdate, visibility: "internal" }),
      createContentMedia: async () => {
        createMediaCalled = true;
        return "media-2";
      },
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.createContentMedia({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          storyUpdateId,
          storagePath: "content-1/internal.jpg",
          altText: "Internal note attachment",
        },
      }),
    ).rejects.toThrow("Internal story updates cannot use public content media");
    expect(createMediaCalled).toBe(false);
  });
});

describe("createContentService createStoryUpdate adopter drafts", () => {
  test("saving an update with the toggle creates adopter drafts", async () => {
    const inserted: unknown[] = [];
    const { service } = buildService({
      content: {},
      storyUpdate: {
        id: "u1",
        contentItemId: "c1",
        visibility: "public",
        title: "救起",
        body: "近況",
        shouldGenerateAdopterDrafts: true,
      },
      recipients: [
        {
          adoptionCaseId: "a1",
          supporterId: "s1",
          name: "陳太",
          email: "adopter@example.test",
          phone: null,
        },
      ],
      insertNotificationDrafts: async (rows) => {
        inserted.push(...rows);
      },
    });
    const result = await service.createStoryUpdate({
      actorUserId: "u1",
      contentId: "c1",
      input: {
        kind: "care",
        title: "救起",
        occurredAt: "2026-09-14T00:00:00.000Z",
        visibility: "public",
        shouldGenerateAdopterDrafts: true,
      },
    });
    expect(result.notificationDrafts.created).toBe(1);
    expect(result.notificationDrafts.warning).toBeNull();
    expect(inserted).toHaveLength(1);
  });

  test("no resolvable recipients still saves the update and warns", async () => {
    const { service } = buildService({
      content: {},
      storyUpdate: {
        id: "u1",
        contentItemId: "c1",
        visibility: "public",
        title: "救起",
        body: null,
        shouldGenerateAdopterDrafts: true,
      },
      recipients: [],
    });
    const result = await service.createStoryUpdate({
      actorUserId: "u1",
      contentId: "c1",
      input: {
        kind: "care",
        title: "救起",
        occurredAt: "2026-09-14T00:00:00.000Z",
        visibility: "public",
        shouldGenerateAdopterDrafts: true,
      },
    });
    expect(result.id).toBeTruthy();
    expect(result.notificationDrafts.created).toBe(0);
    expect(result.notificationDrafts.warning).toBeTruthy();
  });

  test("a generation failure does not throw and the update is saved", async () => {
    const { service, repo } = buildService({
      content: {},
      storyUpdate: {
        id: "u1",
        contentItemId: "c1",
        visibility: "public",
        title: "救起",
        body: null,
        shouldGenerateAdopterDrafts: true,
      },
      recipientsError: new Error("boom"),
    });
    const result = await service.createStoryUpdate({
      actorUserId: "u1",
      contentId: "c1",
      input: {
        kind: "care",
        title: "救起",
        occurredAt: "2026-09-14T00:00:00.000Z",
        visibility: "public",
        shouldGenerateAdopterDrafts: true,
      },
    });
    expect(result.notificationDrafts.created).toBe(0);
    expect(result.notificationDrafts.warning).toBeTruthy();
    expect(repo.createStoryUpdate).toHaveBeenCalled();
  });

  test("an existing draft for the same update/contact is not regenerated", async () => {
    const { service } = buildService({
      content: {},
      draftKeys: [{ channel: "email", recipientContact: "adopter@example.test" }],
      storyUpdate: {
        id: "u1",
        contentItemId: "c1",
        visibility: "public",
        title: "救起",
        body: null,
        shouldGenerateAdopterDrafts: true,
      },
      recipients: [
        {
          adoptionCaseId: "a1",
          supporterId: "s1",
          name: "陳太",
          email: "adopter@example.test",
          phone: null,
        },
      ],
    });
    const result = await service.createStoryUpdate({
      actorUserId: "u1",
      contentId: "c1",
      input: {
        kind: "care",
        title: "救起",
        occurredAt: "2026-09-14T00:00:00.000Z",
        visibility: "public",
        shouldGenerateAdopterDrafts: true,
      },
    });
    expect(result.notificationDrafts.created).toBe(0);
  });

  test("an internal update saves without adopter drafts and warns", async () => {
    let inserted = false;
    const { service } = buildService({
      content: {},
      storyUpdate: {
        id: "u1",
        contentItemId: "c1",
        visibility: "internal",
        title: "救起",
        body: null,
        shouldGenerateAdopterDrafts: true,
      },
      recipients: [
        {
          adoptionCaseId: "a1",
          supporterId: "s1",
          name: "陳太",
          email: "adopter@example.test",
          phone: null,
        },
      ],
      insertNotificationDrafts: async () => {
        inserted = true;
      },
    });
    const result = await service.createStoryUpdate({
      actorUserId: "u1",
      contentId: "c1",
      input: {
        kind: "care",
        title: "救起",
        occurredAt: "2026-09-14T00:00:00.000Z",
        visibility: "internal",
        shouldGenerateAdopterDrafts: true,
      },
    });
    expect(result.id).toBeTruthy();
    expect(result.notificationDrafts.created).toBe(0);
    expect(result.notificationDrafts.warning).toBeTruthy();
    expect(inserted).toBe(false);
  });
});

describe("createContentService createUploadTarget", () => {
  test("requests a signed upload target for a path under the content item", async () => {
    const { repo } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.createUploadTarget({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          objectPath: "content-1/checkup.jpg",
          mimeType: "image/jpeg",
          byteSize: 1024,
          storyUpdateId: null,
        },
      }),
    ).resolves.toEqual({ token: "upload-token", path: "content-1/checkup.jpg" });
  });

  test("rejects an internal story update before requesting a signed upload target", async () => {
    let calledCreateSignedUploadUrl = false;
    const { repo } = createRepo({
      getStoryUpdate: async () => ({ ...publicStoryUpdate, visibility: "internal" }),
      createSignedUploadUrl: async (objectPath) => {
        calledCreateSignedUploadUrl = true;
        return { token: "upload-token", path: objectPath };
      },
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.createUploadTarget({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          objectPath: "content-1/internal.jpg",
          mimeType: "image/jpeg",
          byteSize: 1024,
          storyUpdateId,
        },
      }),
    ).rejects.toThrow("Internal story updates cannot use public content media");
    expect(calledCreateSignedUploadUrl).toBe(false);
  });

  test("rejects an upload target for another content item's story update", async () => {
    const { repo } = createRepo({
      getStoryUpdate: async () => ({ ...publicStoryUpdate, contentItemId: "content-2" }),
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.createUploadTarget({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          objectPath: "content-1/foreign.jpg",
          mimeType: "image/jpeg",
          byteSize: 1024,
          storyUpdateId,
        },
      }),
    ).rejects.toThrow("Story update does not belong to this content item");
  });

  test("rejects an upload path that does not belong to the content item", async () => {
    const { repo } = createRepo();
    let calledCreateSignedUploadUrl = false;
    const spyRepo: ContentRepository = {
      ...repo,
      createSignedUploadUrl: async (objectPath) => {
        calledCreateSignedUploadUrl = true;
        return { token: "upload-token", path: objectPath };
      },
    };
    const spyService = createContentService({
      repo: spyRepo,
      publicBaseUrl: "https://example.test",
    });

    await expect(
      spyService.createUploadTarget({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          objectPath: "some-other-content-item/checkup.jpg",
          mimeType: "image/jpeg",
          byteSize: 1024,
        },
      }),
    ).rejects.toThrow("Upload path does not belong to this content item");
    expect(calledCreateSignedUploadUrl).toBe(false);
  });

  test("rejects a disallowed mime type", async () => {
    const { repo } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.createUploadTarget({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          objectPath: "content-1/checkup.gif",
          mimeType: "image/gif",
          byteSize: 1024,
        },
      }),
    ).rejects.toThrow();
  });

  test("rejects an oversized file", async () => {
    const { repo } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.createUploadTarget({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          objectPath: "content-1/checkup.jpg",
          mimeType: "image/jpeg",
          byteSize: 9 * 1024 * 1024,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("createContentService listAdminContent", () => {
  test("forwards admin-only list filters to the repository", async () => {
    let received: unknown;
    const { repo } = createRepo({
      listAdminContent: async (input) => {
        received = input;
        return { items: [], total: 0 };
      },
    });
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await service.listAdminContent({
      publishedFrom: "2026-01-01",
      publishedTo: "2026-12-31",
      mapVisibility: "on",
      hasUpdate: "yes",
      draftState: "draft",
    });

    expect(received).toMatchObject({
      publishedFrom: "2026-01-01",
      publishedTo: "2026-12-31",
      mapVisibility: "on",
      hasUpdate: "yes",
      draftState: "draft",
    });
  });
});
