import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ContentDetail } from "../../../lib/content/types";

const realReactQuery = await import("@tanstack/react-query");

let historyError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQuery: () => ({
    data: historyError ? undefined : { revisions: [], nextBeforeVersion: null },
    error: historyError,
    isError: historyError !== null,
    refetch: () => {},
  }),
}));

const { ContentRevisionPanel } = await import("./ContentRevisionPanel");

const content: ContentDetail = {
  id: "content-1",
  slug: "siu-bak-recovering",
  type: "rescue_story",
  title: "小白康復中",
  subtitle: null,
  summary: "小白正在寄養家庭休養。",
  coverMediaId: null,
  coverImageUrl: null,
  status: "published",
  publishedAt: null,
  ctaLabel: null,
  ctaUrl: null,
  storyProfile: null,
  latestPublicUpdate: null,
  createdAt: "2026-06-01T08:00:00.000Z",
  updatedAt: "2026-06-20T08:00:00.000Z",
  version: 3,
  body: "正文",
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  links: [],
  media: [],
  updates: [],
  socialCopies: [],
  notificationDrafts: [],
};

describe("ContentRevisionPanel", () => {
  test("shows a retry control instead of the old unclickable reload message on failure", () => {
    historyError = new Error("boom");
    const markup = renderToStaticMarkup(
      <ContentRevisionPanel content={content} disabled={false} onRestore={async () => {}} />,
    );
    expect(markup).toContain("無法載入版本紀錄");
    expect(markup).toContain("重試");
    expect(markup).not.toContain("未能載入");
    historyError = null;
  });
});
