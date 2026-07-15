import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseContentRepository } from "./repository.server";
import { createContentService } from "./service";
import type { ContentSummary, PublicStoryMapPoint } from "./types";

export type PublicStoriesPageData = {
  items: ContentSummary[];
  total: number;
  points: PublicStoryMapPoint[];
};

type PublicStoriesPageService = {
  listPublicStoriesPage(input: unknown): Promise<PublicStoriesPageData>;
};

export function createPublicStoriesPageReader(service: PublicStoriesPageService) {
  return async (): Promise<PublicStoriesPageData> => {
    try {
      return await service.listPublicStoriesPage({});
    } catch {
      throw new Error("Could not load stories");
    }
  };
}

export async function loadPublicStoriesPage() {
  const client = createSupabaseServiceClient();
  const service = createContentService({
    repo: createSupabaseContentRepository(client),
    publicBaseUrl: process.env.APP_URL ?? "http://localhost:5173",
  });
  return createPublicStoriesPageReader(service)();
}
