import { describe, expect, test } from "bun:test";

import { buildPublicContentSnapshot, ContentLifecycleError } from "./lifecycle";
import type { ContentDetail } from "./types";

const detail = {
  id: "content-1",
  slug: "siu-bak",
  type: "rescue_story",
  title: "小白",
  subtitle: null,
  summary: "小白的故事",
  body: "公開正文",
  coverMediaId: "media-public",
  coverImageUrl: "https://example.test/public.jpg",
  status: "draft",
  publishedAt: null,
  ctaLabel: null,
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
    rescueDate: null,
    showOnMap: false,
    publicMapLabel: null,
    publicLat: null,
    publicLng: null,
    internalAddress: "private address",
    internalLocationNotes: "private note",
    isFeatured: false,
  },
  links: [{ id: "link-1" }],
  media: [
    { id: "media-public", storyUpdateId: "update-public" },
    { id: "media-internal", storyUpdateId: "update-internal" },
  ],
  updates: [
    { id: "update-public", visibility: "public", media: [] },
    { id: "update-internal", visibility: "internal", media: [] },
  ],
  socialCopies: [{ id: "social-1" }],
  notificationDrafts: [{ id: "draft-1" }],
  latestPublicUpdate: null,
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
} as unknown as ContentDetail;

describe("content lifecycle snapshots", () => {
  test("removes a cover belonging to an internal update", () => {
    const snapshot = buildPublicContentSnapshot({
      ...detail,
      coverMediaId: "media-internal",
      coverImageUrl: "https://example.test/internal.jpg",
    });
    expect(snapshot.coverMediaId).toBeNull();
    expect(snapshot.coverImageUrl).toBeNull();
  });
  test("excludes private authoring data from immutable public snapshots", () => {
    const snapshot = buildPublicContentSnapshot(detail);

    expect(snapshot.storyProfile?.internalAddress).toBeNull();
    expect(snapshot.storyProfile?.internalLocationNotes).toBeNull();
    expect(snapshot.links).toEqual([]);
    expect(snapshot.updates.map((update) => update.id)).toEqual(["update-public"]);
    expect(snapshot.media.map((media) => media.id)).toEqual(["media-public"]);
    expect(snapshot.socialCopies).toEqual([]);
    expect(snapshot.notificationDrafts).toEqual([]);
  });

  test("classifies stale and replay conflicts for HTTP mapping", () => {
    expect(new ContentLifecycleError("conflict").status).toBe(409);
    expect(new ContentLifecycleError("not_found").status).toBe(404);
  });
});
