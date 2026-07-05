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
    title: `故事 ${index}`,
    animalType: index % 2 === 0 ? "dog" : "cat",
    publicStatus: "medical_care",
    rescueRegion: "灣仔",
    publicMapLabel: `公開區域 ${index}`,
    lat: 22.26 + index * 0.01,
    lng: 114.12 + index * 0.01,
    latestUpdateTitle: null,
  };
}

describe("RescueMap", () => {
  test("renders a coordinate marker for every public map point", async () => {
    const { RescueMap } = await import("./RescueMap");
    const points = Array.from({ length: 10 }, (_, index) => makePoint(index + 1));
    const markup = renderToStaticMarkup(<RescueMap points={points} />);

    expect(markup.match(/data-map-marker=/g)?.length).toBe(points.length);
    expect(markup).toContain("公開區域 10");
    expect(markup).not.toContain("internalAddress");
    expect(markup).not.toContain("internalLocationNotes");
  });
});
