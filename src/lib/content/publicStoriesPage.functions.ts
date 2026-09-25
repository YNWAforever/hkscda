import { createServerFn } from "@tanstack/react-start";

export const getPublicStoriesPage = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicStoriesPage } = await import("./publicStoriesPage.server");
  return loadPublicStoriesPage();
});

export const getFeaturedPublicStory = createServerFn({ method: "GET" }).handler(async () => {
  const { loadFeaturedStory } = await import("./publicStoriesPage.server");
  return loadFeaturedStory();
});
