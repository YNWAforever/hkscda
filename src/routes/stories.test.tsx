import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { PublicStoriesPageData } from "../lib/content/publicStoriesPage.server";

mock.module("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    to,
    ...props
  }: {
    children: React.ReactNode;
    params?: { slug?: string };
    to: string;
  }) => (
    <a href={params?.slug ? to.replace("$slug", params.slug) : to} {...props}>
      {children}
    </a>
  ),
  createFileRoute: () => (options: unknown) => options,
}));

mock.module("../lib/content/publicStoriesPage.functions", () => ({
  getPublicStoriesPage: async () => data,
}));

const data: PublicStoriesPageData = {
  items: [
    {
      id: "story-lucky",
      slug: "lucky",
      type: "rescue_story",
      title: "Lucky",
      subtitle: null,
      summary: "Lucky is recovering with patient care.",
      coverMediaId: null,
      coverImageUrl: null,
      status: "published",
      publishedAt: "2026-01-01T00:00:00.000Z",
      ctaLabel: null,
      ctaUrl: null,
      storyProfile: {
        contentItemId: "story-lucky",
        animalType: "dog",
        publicStatus: "medical_care",
        rescueRegion: "Central",
        rescueDate: null,
        showOnMap: false,
        publicMapLabel: null,
        publicLat: null,
        publicLng: null,
        isFeatured: true,
      },
      latestPublicUpdate: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  total: 1,
  points: [],
};

describe("stories route", () => {
  test("delegates loading once", async () => {
    const { createStoriesLoader } = await import("./stories");
    let calls = 0;
    const loader = createStoriesLoader(async () => {
      calls += 1;
      return data;
    });

    expect(await loader()).toBe(data);
    expect(calls).toBe(1);
  });

  test("renders loader stories into SSR markup", async () => {
    const { StoriesPageContent } = await import("./stories");
    const markup = renderToStaticMarkup(<StoriesPageContent data={data} />);

    expect(markup).toContain("Lucky");
    expect(markup).toContain("/stories/lucky");
  });

  test("renders only the Traditional Chinese load error", async () => {
    const { StoriesLoadError } = await import("./stories");
    const markup = renderToStaticMarkup(<StoriesLoadError />);
    const visibleText = markup.replace(/<[^>]*>/g, "");
    const providerDetail = "SupabaseError: connection refused";

    expect(visibleText).toBe("暫時未能載入故事，請稍後再試。");
    expect(markup).not.toContain(providerDetail);
  });

  test("uses rescue-case metadata and medical donation actions", async () => {
    const { StoriesPageContent } = await import("./stories");
    const markup = renderToStaticMarkup(<StoriesPageContent data={data} />);
    const head = readFileSync(join(process.cwd(), "src/routes/stories.tsx"), "utf8");

    expect(markup).toContain("救援個案");
    expect(markup).toContain("支援醫療費用 ｜ 立即捐助");
    expect(head).toContain("救援個案");
  });
});
