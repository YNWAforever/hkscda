import { describe, expect, test } from "bun:test";
import { toContentSummary, toStoryUpdate } from "./repository.server";

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
        [],
      ),
    ).toMatchObject({
      id: "update-1",
      contentItemId: "content-1",
      kind: "medical",
      shouldGenerateAdopterDrafts: true,
      media: [],
    });
  });
});
