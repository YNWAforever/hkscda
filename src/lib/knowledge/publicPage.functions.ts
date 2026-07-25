import { createServerFn } from "@tanstack/react-start";

export const getPublicKnowledgePage = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicKnowledgePage } = await import("./publicPage.server");
  return loadPublicKnowledgePage();
});
