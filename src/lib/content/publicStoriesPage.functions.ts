import { createServerFn } from "@tanstack/react-start";

export const getPublicStoriesPage = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicStoriesPage } = await import("./publicStoriesPage.server");
  return loadPublicStoriesPage();
});
