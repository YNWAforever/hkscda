import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { PublicStorySummary } from "../../../lib/content/publicStoriesPage.types";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children: React.ReactNode; params: { slug: string } }) => (
    <a href={"/stories/" + params.slug}>{children}</a>
  ),
}));

const endedEvent: PublicStorySummary = {
  id: "event-1",
  slug: "old-event",
  type: "event",
  title: "舊活動",
  subtitle: null,
  summary: "活動記錄",
  coverMediaId: null,
  coverImageUrl: null,
  status: "published",
  publishedAt: "2020-01-01T00:00:00.000Z",
  effectiveUntil: "2020-02-01T00:00:00.000Z",
  ctaLabel: "立即報名",
  ctaUrl: "https://example.org/register",
  storyProfile: null,
  latestPublicUpdate: null,
  createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-01T00:00:00.000Z",
};

test("ended event remains in archive without an active signup action", async () => {
  const { StoryContentGrid } = await import("./StoryContentGrid");
  const markup = renderToStaticMarkup(<StoryContentGrid items={[endedEvent]} />);
  expect(markup).toContain("已結束活動與義賣");
  expect(markup).toContain("舊活動");
  expect(markup).toContain("old-event");
  expect(markup).not.toContain("立即報名");
  expect(markup).not.toContain("https://example.org/register");
});
