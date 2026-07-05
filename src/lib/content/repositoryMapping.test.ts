import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseContentRepository,
  toContentSummary,
  toPublicContentDetail,
  toStoryUpdate,
} from "./repository.server";
import type { ContentDetail, ContentMedia, StoryUpdate } from "./types";

const publicUpdate: StoryUpdate = {
  id: "public-update",
  contentItemId: "content-1",
  kind: "medical",
  title: "公開更新",
  body: null,
  occurredAt: "2026-07-05T10:00:00.000Z",
  visibility: "public",
  shouldGenerateAdopterDrafts: false,
  media: [],
  createdAt: "2026-07-05T10:00:00.000Z",
  updatedAt: "2026-07-05T10:00:00.000Z",
};

const internalUpdate: StoryUpdate = {
  ...publicUpdate,
  id: "internal-update",
  title: "內部更新",
  visibility: "internal",
};

function createMissingUpdateClient(error: Error) {
  return {
    from() {
      return {
        update() {
          return {
            eq() {
              return {
                select() {
                  return {
                    single: async () => ({ data: null, error }),
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("content repository mapping", () => {
  test("maps content rows into camelCase summaries", () => {
    expect(
      toContentSummary({
        id: "content-1",
        slug: "siu-bak",
        type: "rescue_story",
        title: "小白",
        subtitle: null,
        summary: "康復中",
        body: null,
        cover_media_id: "media-1",
        status: "published",
        published_at: "2026-07-05T10:00:00.000Z",
        cta_label: "支持",
        cta_url: "/donate",
        seo_title: null,
        seo_description: null,
        og_title: null,
        og_description: null,
        created_at: "2026-07-05T09:00:00.000Z",
        updated_at: "2026-07-05T09:00:00.000Z",
      }),
    ).toMatchObject({
      id: "content-1",
      slug: "siu-bak",
      type: "rescue_story",
      title: "小白",
      coverMediaId: "media-1",
      status: "published",
      latestPublicUpdate: null,
    });
  });

  test("maps story updates with attached media", () => {
    const media: ContentMedia[] = [
      {
        id: "media-1",
        contentItemId: "content-1",
        storyUpdateId: "update-1",
        url: "https://example.test/media.jpg",
        storageBucket: "content-media",
        storagePath: "stories/media.jpg",
        altText: "小白近照",
        caption: null,
        sortOrder: 1,
        isCover: false,
        createdAt: "2026-07-05T10:00:00.000Z",
        updatedAt: "2026-07-05T10:00:00.000Z",
      },
    ];

    expect(
      toStoryUpdate(
        {
          id: "update-1",
          content_item_id: "content-1",
          kind: "medical",
          title: "疫苗完成",
          body: null,
          occurred_at: "2026-07-05T10:00:00.000Z",
          visibility: "public",
          should_generate_adopter_drafts: true,
          created_at: "2026-07-05T10:00:00.000Z",
          updated_at: "2026-07-05T10:00:00.000Z",
        },
        media,
      ),
    ).toMatchObject({
      id: "update-1",
      contentItemId: "content-1",
      kind: "medical",
      shouldGenerateAdopterDrafts: true,
      media,
    });
  });

  test("strips internal relationships and private media from public details", () => {
    const detail: ContentDetail = {
      id: "content-1",
      slug: "siu-bak",
      type: "rescue_story",
      title: "小白",
      subtitle: null,
      summary: "康復中",
      body: "故事正文",
      coverMediaId: "internal-cover",
      coverImageUrl: "https://example.test/internal-cover.jpg",
      status: "published",
      publishedAt: "2026-07-05T10:00:00.000Z",
      ctaLabel: null,
      ctaUrl: null,
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
        showOnMap: true,
        publicMapLabel: "灣仔區救援",
        publicLat: 22.277,
        publicLng: 114.173,
        internalAddress: "internal exact address",
        internalLocationNotes: "reporter details",
        isFeatured: true,
      },
      latestPublicUpdate: publicUpdate,
      links: [
        {
          id: "link-1",
          contentItemId: "content-1",
          linkedType: "adoption_case",
          linkedId: "case-1",
          relationship: "related_case",
          label: null,
          createdAt: "2026-07-05T09:00:00.000Z",
          updatedAt: "2026-07-05T09:00:00.000Z",
        },
      ],
      media: [
        {
          id: "internal-cover",
          contentItemId: "content-1",
          storyUpdateId: "internal-update",
          url: "https://example.test/internal-cover.jpg",
          storageBucket: "content-media",
          storagePath: "internal-cover.jpg",
          altText: "內部相片",
          caption: null,
          sortOrder: 0,
          isCover: true,
          createdAt: "2026-07-05T09:00:00.000Z",
          updatedAt: "2026-07-05T09:00:00.000Z",
        },
        {
          id: "public-cover",
          contentItemId: "content-1",
          storyUpdateId: null,
          url: "https://example.test/public-cover.jpg",
          storageBucket: "content-media",
          storagePath: "public-cover.jpg",
          altText: "公開相片",
          caption: null,
          sortOrder: 1,
          isCover: true,
          createdAt: "2026-07-05T09:00:00.000Z",
          updatedAt: "2026-07-05T09:00:00.000Z",
        },
      ],
      updates: [internalUpdate, publicUpdate],
      socialCopies: [
        {
          id: "copy-1",
          contentItemId: "content-1",
          storyUpdateId: null,
          platform: "facebook",
          language: "zh-HK",
          copyText: "internal copy",
          hashtags: [],
          status: "draft",
          createdAt: "2026-07-05T09:00:00.000Z",
          updatedAt: "2026-07-05T09:00:00.000Z",
        },
      ],
      notificationDrafts: [
        {
          id: "draft-1",
          storyUpdateId: "public-update",
          contentItemId: "content-1",
          adoptionCaseId: "case-1",
          supporterId: "supporter-1",
          channel: "email",
          recipientName: "陳小姐",
          recipientContact: "ada@example.com",
          subject: "internal subject",
          body: "internal body",
          status: "draft",
          createdAt: "2026-07-05T09:00:00.000Z",
          updatedAt: "2026-07-05T09:00:00.000Z",
        },
      ],
      createdAt: "2026-07-05T09:00:00.000Z",
      updatedAt: "2026-07-05T09:00:00.000Z",
    };

    const publicDetail = toPublicContentDetail(detail);

    expect(publicDetail.links).toEqual([]);
    expect(publicDetail.socialCopies).toEqual([]);
    expect(publicDetail.notificationDrafts).toEqual([]);
    expect(publicDetail.storyProfile?.internalAddress).toBeNull();
    expect(publicDetail.storyProfile?.internalLocationNotes).toBeNull();
    expect(publicDetail.updates.map((update) => update.id)).toEqual(["public-update"]);
    expect(publicDetail.media.map((item) => item.id)).toEqual(["public-cover"]);
    expect(publicDetail.coverMediaId).toBe("public-cover");
    expect(publicDetail.coverImageUrl).toBe("https://example.test/public-cover.jpg");
    expect(JSON.stringify(publicDetail)).not.toContain("internal-cover.jpg");
    expect(JSON.stringify(publicDetail)).not.toContain("case-1");
  });

  test("fails status updates when Supabase returns missing-row errors", async () => {
    const repository = createSupabaseContentRepository(
      createMissingUpdateClient(new Error("JSON object requested, multiple (or no) rows returned")),
    );

    await expect(repository.updateSocialCopyStatus("missing-copy", "copied")).rejects.toThrow(
      "JSON object requested",
    );
    await expect(
      repository.updateNotificationDraftStatus("missing-draft", "dismissed"),
    ).rejects.toThrow("JSON object requested");
  });
});
