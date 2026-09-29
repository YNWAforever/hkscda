import { createServerFn } from "@tanstack/react-start";

export const getPublicAdoptionPageResult = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicAdoptionPage } = await import("./publicPage.server");
  const { resilientPublicLoader } = await import("../routing/resilientLoader");
  // Generate/log the safe reference on the server for SSR and client navigation alike.
  return resilientPublicLoader(loadPublicAdoptionPage)();
});

// The authenticated editor preview retains its existing raw-data loader contract.
export const getPublicAdoptionPage = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicAdoptionPage } = await import("./publicPage.server");
  return loadPublicAdoptionPage();
});
