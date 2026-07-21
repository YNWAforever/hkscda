import { createServerFn } from "@tanstack/react-start";

export const getPublicAdoptionPage = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicAdoptionPage } = await import("./publicPage.server");
  return loadPublicAdoptionPage();
});
