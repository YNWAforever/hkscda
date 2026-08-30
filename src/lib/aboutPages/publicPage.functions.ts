import { createServerFn } from "@tanstack/react-start";

export const getAboutPageContent = createServerFn({ method: "GET" }).handler(async () => {
  const { loadAboutPageContent } = await import("./publicPage.server");
  return loadAboutPageContent("about");
});

export const getTnrPageContent = createServerFn({ method: "GET" }).handler(async () => {
  const { loadAboutPageContent } = await import("./publicPage.server");
  return loadAboutPageContent("tnr");
});

export const getCccpPageContent = createServerFn({ method: "GET" }).handler(async () => {
  const { loadAboutPageContent } = await import("./publicPage.server");
  return loadAboutPageContent("cccp");
});
