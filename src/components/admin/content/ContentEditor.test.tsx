import { describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

import type { ContentDetail } from "../../../lib/content/types";

const realReactRouter = await import("@tanstack/react-router");

type MockLinkProps = {
  children: ReactNode;
  className?: string;
  to: string;
};

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  Link: ({ children, className, to }: MockLinkProps) => (
    <a data-router-link="true" href={to} className={className}>
      {children}
    </a>
  ),
}));

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
  test("renders authoring controls for story profile, updates, media, and links", async () => {
    const { ContentAuthoringPanels } = await import("./ContentEditor");
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
    // The manual bucket/path text-entry fields must be gone, replaced by a
    // real file picker.
    expect(markup).toContain('type="file"');
    expect(markup).toContain('accept="image/*"');
    expect(markup).not.toContain("Storage bucket");
    expect(markup).not.toContain("Storage path");
  });

  test("uses a router link for returning to the content list", async () => {
    const { ContentEditor } = await import("./ContentEditor");
    const queryClient = new QueryClient();

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ContentEditor contentId={content.id} initialContent={content} />
      </QueryClientProvider>,
    );

    expect(markup).toContain('data-router-link="true"');
    expect(markup).toContain('href="/admin/content"');
    expect(markup).toContain("返回宣傳內容");
  });
});
