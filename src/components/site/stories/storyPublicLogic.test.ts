import { describe, expect, test } from "bun:test";

import type { ContentSummary } from "../../../lib/content/types";
import { filterStoryCards, publicStatusLabel } from "./storyPublicLogic";

function makeStory(
  overrides: Partial<ContentSummary> & {
    id: string;
    type?: ContentSummary["type"];
    storyProfile?: NonNullable<ContentSummary["storyProfile"]> | null;
  },
): ContentSummary {
  const storyProfile = overrides.storyProfile ?? {
    contentItemId: overrides.id,
    animalType: "cat",
    publicStatus: "medical_care",
    rescueRegion: "灣仔",
    rescueDate: null,
    showOnMap: true,
    publicMapLabel: "灣仔一帶",
    publicLat: null,
    publicLng: null,
    internalAddress: null,
    internalLocationNotes: null,
    isFeatured: false,
  };

  return {
    id: overrides.id,
    slug: `${overrides.id}-story`,
    type: overrides.type ?? "rescue_story",
    title: overrides.title ?? `Story ${overrides.id}`,
    subtitle: null,
    summary: "Public rescue summary",
    coverMediaId: null,
    coverImageUrl: null,
    status: "published",
    publishedAt: "2026-01-01T00:00:00.000Z",
    ctaLabel: null,
    ctaUrl: null,
    storyProfile,
    latestPublicUpdate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const stories: ContentSummary[] = [
  makeStory({ id: "a" }),
  makeStory({
    id: "b",
    storyProfile: {
      contentItemId: "b",
      animalType: "dog",
      publicStatus: "adopted",
      rescueRegion: "深水埗",
      rescueDate: null,
      showOnMap: true,
      publicMapLabel: "深水埗一帶",
      publicLat: null,
      publicLng: null,
      internalAddress: null,
      internalLocationNotes: null,
      isFeatured: false,
    },
  }),
  makeStory({ id: "c", type: "event", storyProfile: null }),
];

describe("story public logic", () => {
  test("filters rescue story cards by animal type", () => {
    expect(filterStoryCards(stories, { animalType: "cat" }).map((story) => story.id)).toEqual([
      "a",
    ]);
  });

  test("filters rescue story cards by public status", () => {
    expect(filterStoryCards(stories, { publicStatus: "adopted" }).map((story) => story.id)).toEqual(
      ["b"],
    );
  });

  test("filters rescue story cards by rescue region", () => {
    expect(filterStoryCards(stories, { rescueRegion: "灣仔" }).map((story) => story.id)).toEqual([
      "a",
    ]);
  });

  test("returns public Chinese status labels", () => {
    expect(publicStatusLabel("medical_care")).toBe("醫療照護");
    expect(publicStatusLabel("ready_for_adoption")).toBe("準備領養");
  });
});
