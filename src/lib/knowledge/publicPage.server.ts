import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseKnowledgeRepository } from "./repository.server";
import type { KnowledgePost, KnowledgeRepository } from "./types";

export type PublicKnowledgePageData = { posts: KnowledgePost[] };

type PublicRepository = Pick<KnowledgeRepository, "listPublished">;

export function createPublicKnowledgePageReader({ repository }: { repository: PublicRepository }) {
  return async (): Promise<PublicKnowledgePageData> => {
    const posts = (await repository.listPublished())
      .filter((post) => post.isPublished)
      .sort((left, right) => left.sortOrder - right.sortOrder || right.createdAt.localeCompare(left.createdAt));
    return { posts };
  };
}

export async function loadPublicKnowledgePage() {
  try {
    const client = createSupabaseServiceClient();
    return await createPublicKnowledgePageReader({ repository: createSupabaseKnowledgeRepository(client) })();
  } catch {
    throw new Error("Could not load knowledge resources");
  }
}
