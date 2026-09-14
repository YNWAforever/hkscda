import { describe, expect, test } from "bun:test";
import {
  buildPublicStoryMapPoint,
  validatePublishableContent,
  validateStoryMapVisibility,
} from "./rules";
import type { ContentDetail } from "./types";

const baseContent: ContentDetail = {
  id: "content-1",
  slug: "siu-bak-recovery",
  type: "rescue_story",
  title: "小白康復中",
  subtitle: null,
  summary: "小白已完成疫苗接種，現於暫養家庭康復中。",
  body: "小白在灣仔被救起，現正穩定康復。",
  coverMediaId: "media-1",
  coverImageUrl: "https://example.test/cover.jpg",
  status: "draft",
  publishedAt: "2026-07-05T10:00:00.000Z",
  ctaLabel: "了解領養",
  ctaUrl: "/adoption",
  latestPublicUpdate: null,
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  links: [],
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
    internalAddress: "灣仔後巷 exact address",
    internalLocationNotes: "Reporter details",
    isFeatured: true,
  },
  media: [],
  updates: [],
  socialCopies: [],
  notificationDrafts: [],
  createdAt: "2026-07-05T09:00:00.000Z",
  updatedAt: "2026-07-05T09:00:00.000Z",
};

describe("content publish rules", () => {
  test("requires a title before publishing", () => {
    expect(validatePublishableContent({ ...baseContent, title: "" })).toEqual([
      { field: "title", message: "Title is required before publishing" },
    ]);
  });

  test("requires story wall settings for rescue stories before publishing", () => {
    expect(validatePublishableContent({ ...baseContent, storyProfile: null })).toContainEqual({
      field: "storyProfile",
      message: "Rescue stories need Story Wall settings before publishing",
    });
  });

  test("requires public-safe map fields when a story is map visible", () => {
    expect(
      validateStoryMapVisibility({
        ...baseContent.storyProfile!,
        publicMapLabel: null,
        publicLat: null,
        publicLng: null,
      }),
    ).toEqual([
      {
        field: "publicMapLabel",
        message: "Map label is required when showing this story on the map",
      },
      { field: "publicLat", message: "Approximate public latitude is required for map stories" },
      { field: "publicLng", message: "Approximate public longitude is required for map stories" },
    ]);
  });

  test("maps story details to public map points", () => {
    expect(buildPublicStoryMapPoint(baseContent)).toEqual({
      id: "content-1",
      slug: "siu-bak-recovery",
      title: "小白康復中",
      animalType: "cat",
      publicStatus: "medical_care",
      rescueRegion: "灣仔",
      publicMapLabel: "灣仔區救援",
      lat: 22.277,
      lng: 114.173,
      latestUpdateTitle: null,
    });
  });

  test("does not leak internal rescue locations in public map points", () => {
    expect(JSON.stringify(buildPublicStoryMapPoint(baseContent))).not.toContain("exact address");
    expect(JSON.stringify(buildPublicStoryMapPoint(baseContent))).not.toContain("Reporter details");
  });
});

describe("validatePublishableContent type coverage", () => {
  test("accepts a complete event/market/report and does not require publishedAt", () => {
    for (const type of ["event", "charity_market", "report"] as const) {
      expect(validatePublishableContent({ ...baseContent, type, publishedAt: null })).toEqual([]);
    }
  });

  test("requires the shared fields for every type", () => {
    const issues = validatePublishableContent({
      ...baseContent,
      title: "",
      slug: "",
      summary: "",
      coverMediaId: null,
      coverImageUrl: null,
    });
    expect(issues.map((i) => i.field).sort()).toEqual(["coverMediaId", "slug", "summary", "title"]);
  });

  test("requires rescue animalType and publicStatus", () => {
    const issues = validatePublishableContent({
      ...baseContent,
      storyProfile: {
        ...baseContent.storyProfile!,
        animalType: "" as never,
        publicStatus: "" as never,
      },
    });
    expect(issues.map((i) => i.field)).toContain("animalType");
    expect(issues.map((i) => i.field)).toContain("publicStatus");
  });
});
