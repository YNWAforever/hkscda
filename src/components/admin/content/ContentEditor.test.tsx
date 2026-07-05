import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ContentDetail } from "../../../lib/content/types";
import { ContentAuthoringPanels } from "./ContentEditor";

const content: ContentDetail = {
  id: "content-1",
  slug: "siu-bak-recovery",
  type: "rescue_story",
  title: "小白康復中",
  subtitle: null,
  summary: "小白正在康復。",
  body: "救援故事正文",
  coverMediaId: null,
  coverImageUrl: null,
  status: "draft",
  publishedAt: null,
  ctaLabel: null,
  ctaUrl: null,
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  storyProfile: null,
  latestPublicUpdate: null,
  links: [],
  media: [],
  updates: [],
  socialCopies: [],
  notificationDrafts: [],
  createdAt: "2026-07-05T09:00:00.000Z",
  updatedAt: "2026-07-05T09:00:00.000Z",
};

describe("ContentEditor", () => {
  test("renders authoring controls for story profile, updates, media, and links", () => {
    const markup = renderToStaticMarkup(
      <ContentAuthoringPanels
        content={content}
        pending={false}
        onCreateLink={async () => undefined}
        onSaveStoryProfile={async () => undefined}
        onCreateStoryUpdate={async () => undefined}
        onCreateMedia={async () => undefined}
      />,
    );

    expect(markup).toContain("儲存故事設定");
    expect(markup).toContain("新增故事更新");
    expect(markup).toContain("新增媒體");
    expect(markup).toContain("新增關聯紀錄");
  });
});
