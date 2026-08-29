import { createServerFn } from "@tanstack/react-start";

export const getPublicBoardRoster = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicBoardRoster } = await import("./publicPage.server");
  return loadPublicBoardRoster();
});
