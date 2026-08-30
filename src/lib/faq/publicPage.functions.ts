import { createServerFn } from "@tanstack/react-start";

export const getPublicFaqs = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicFaqs } = await import("./publicPage.server");
  return loadPublicFaqs();
});
