import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ContentManagement } from "./ContentManagement";
import type { ContentListResponse } from "./ContentManagement";

describe("ContentManagement", () => {
  test("renders the admin content workspace with initial data", () => {
    const initialData: ContentListResponse = {
      content: [
        {
          id: "content-1",
          slug: "siu-bak-recovering",
          type: "rescue_story",
          title: "小白康復中",
          subtitle: null,
          summary: "小白正在寄養家庭休養。",
          coverMediaId: null,
          coverImageUrl: null,
          status: "published",
          publishedAt: "2026-06-20T08:00:00.000Z",
          ctaLabel: null,
          ctaUrl: null,
          storyProfile: {
            contentItemId: "content-1",
            animalType: "cat",
            publicStatus: "foster_recovery",
            rescueRegion: "灣仔",
            rescueDate: "2026-06-01",
            showOnMap: true,
            publicMapLabel: "灣仔",
            publicLat: null,
            publicLng: null,
            internalAddress: null,
            internalLocationNotes: null,
            isFeatured: false,
          },
          latestPublicUpdate: null,
          createdAt: "2026-06-01T08:00:00.000Z",
          updatedAt: "2026-06-20T08:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 25, total: 1, pageCount: 1 },
    };

    const markup = renderToStaticMarkup(<ContentManagement initialData={initialData} />);

    expect(markup).toContain("宣傳內容");
    expect(markup).toContain("小白康復中");
    expect(markup).toContain("救援故事");
  });
});
