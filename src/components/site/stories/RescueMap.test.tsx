import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { PublicStoryMapPoint } from "../../../lib/content/types";

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
}));

function makePoint(index: number): PublicStoryMapPoint {
  return {
    id: `point-${index}`,
    slug: `story-${index}`,
    title: `Story ${index}`,
    animalType: index % 2 === 0 ? "dog" : "cat",
    publicStatus: "medical_care",
    rescueRegion: "Kowloon",
    publicMapLabel: `Rescue ${index}`,
    lat: 22.26 + index * 0.01,
    lng: 114.12 + index * 0.01,
    latestUpdateTitle: null,
  };
}

describe("RescueMap", () => {
  test("keeps story links visible when the Google Maps key is missing", async () => {
    const { RescueMap } = await import("./RescueMap");
    const markup = renderToStaticMarkup(<RescueMap points={[makePoint(1)]} apiKey="" />);

    expect(markup).toContain('href="/stories/story-1"');
    expect(markup).not.toContain('data-google-rescue-map="ready"');
  });

  test("mounts the Google map canvas only when a key and points exist", async () => {
    const { RescueMap } = await import("./RescueMap");
    const markup = renderToStaticMarkup(<RescueMap points={[makePoint(1)]} apiKey="test-key" />);

    expect(markup).toContain('data-google-rescue-map="ready"');
    expect(markup).not.toContain("test-key");
    expect(markup).not.toContain("internalAddress");
    expect(markup).not.toContain("internalLocationNotes");
  });
});
