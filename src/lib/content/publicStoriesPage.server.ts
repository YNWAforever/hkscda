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

type PublicStoriesPageServiceFactory = () => PublicStoriesPageService;

export function createPublicStoriesPageReader(service: PublicStoriesPageService) {
  return async (): Promise<PublicStoriesPageData> => {
    try {
      return await service.listPublicStoriesPage({});
    } catch {
      throw new Error("Could not load stories");
    }
  };
}

function createPublicStoriesPageService() {
  const client = createSupabaseServiceClient();
  return createContentService({
    repo: createSupabaseContentRepository(client),
    publicBaseUrl: process.env.APP_URL ?? "http://localhost:5173",
  });
}

export async function loadPublicStoriesPage(
  createService: PublicStoriesPageServiceFactory = createPublicStoriesPageService,
) {
  try {
    return await createPublicStoriesPageReader(createService())();
  } catch {
    throw new Error("Could not load stories");
  }
}
