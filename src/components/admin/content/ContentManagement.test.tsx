import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

import { renderAdminInChinese } from "../i18n/testing";
import type { ContentListResponse } from "./ContentManagement";

const realReactRouter = await import("@tanstack/react-router");
const realReactQuery = await import("@tanstack/react-query");

type MockLinkProps = {
  children: ReactNode;
  className?: string;
  params?: Record<string, string>;
  to: string;
};

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  useNavigate: () => () => Promise.resolve(),
  Link: ({ children, className, params, to }: MockLinkProps) => {
    const href = params
      ? Object.entries(params).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
      : to;
    return (
      <a data-router-link="true" href={href} className={className}>
        {children}
      </a>
    );
  },
}));

let contentError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  useQuery: () => ({
    data: contentError
      ? undefined
      : { content: [], pagination: { page: 1, pageSize: 25, total: 0, pageCount: 1 } },
    error: contentError,
    isLoading: false,
    isFetching: false,
    refetch: () => {},
  }),
}));

async function renderContentManagement(initialData: ContentListResponse) {
  const { ContentManagement } = await import("./ContentManagement");
  return renderAdminInChinese(<ContentManagement initialData={initialData} />);
}

describe("ContentManagement", () => {
  test("renders the admin content workspace with initial data", async () => {
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

    const markup = await renderContentManagement(initialData);

    expect(markup).toContain("宣傳內容");
    expect(markup).toContain("小白康復中");
    expect(markup).toContain("救援故事");
  });

  test("uses pagination total for the total summary card", async () => {
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
          publishedAt: null,
          ctaLabel: null,
          ctaUrl: null,
          storyProfile: null,
          latestPublicUpdate: null,
          createdAt: "2026-06-01T08:00:00.000Z",
          updatedAt: "2026-06-20T08:00:00.000Z",
        },
      ],
      pagination: { page: 2, pageSize: 25, total: 42, pageCount: 2 },
    };

    const markup = await renderContentManagement(initialData);

    expect(markup).toContain("全部內容");
    expect(markup).toContain(">42</p>");
  });

  test("uses router links for edit navigation so admin sessions stay client-side", async () => {
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
          status: "draft",
          publishedAt: null,
          ctaLabel: null,
          ctaUrl: null,
          storyProfile: null,
          latestPublicUpdate: null,
          createdAt: "2026-06-01T08:00:00.000Z",
          updatedAt: "2026-06-20T08:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 25, total: 1, pageCount: 1 },
    };

    const markup = await renderContentManagement(initialData);

    expect(markup).toContain('data-router-link="true"');
    expect(markup).toContain('href="/admin/content/content-1"');
  });

  test("shows a retry instead of zeroed summary cards and a false empty state when the query fails", async () => {
    // rows defaulted to `data?.content ?? []` on a rejected query, so
    // summarizeContentRows saw an empty array and all four summary cards read
    // a real 0 -- and the table's plain `empty="沒有宣傳內容"` string rendered
    // right next to it, with nothing to say a fetch had actually failed.
    contentError = new Error("boom");
    const { ContentManagement } = await import("./ContentManagement");
    const markup = renderAdminInChinese(<ContentManagement />);
    expect(markup).toContain("無法載入");
    expect(markup).not.toContain("沒有宣傳內容");
    expect((markup.match(/—/g) ?? []).length).toBe(4);
    contentError = null;
  });
});

test("links to document and annual-report workspaces", async () => {
  const markup = await renderContentManagement({
    content: [],
    pagination: { page: 1, pageSize: 25, total: 0, pageCount: 1 },
  });

  expect(markup).toContain('href="/admin/content/documents"');
  expect(markup).toContain(">文件</a>");
  expect(markup).toContain('href="/admin/content/annual-reports"');
  expect(markup).toContain(">年度報告</a>");
  expect(markup).toContain('href="/admin/content/adoption"');
  expect(markup).toContain(">領養資訊</a>");
  expect(markup).toContain('href="/admin/content/adoption-guides"');
  expect(markup).toContain(">\u9818\u990a\u5f8c\u6307\u5357\u7248\u672c</a>");
});
