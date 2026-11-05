import { createServerFn } from "@tanstack/react-start";
import { publicStorySlugInputSchema } from "./schemas";

export const getPublicStory = createServerFn({ method: "GET" })
  .inputValidator(publicStorySlugInputSchema)
  .handler(async ({ data }) => {
    const [
      { createSupabaseContentRepository },
      { createContentService },
      { createSupabaseServiceClient },
      { getAppUrl },
    ] = await Promise.all([
      import("./repository.server"),
      import("./service"),
      import("../donations/supabase.server"),
      import("../appUrl.server"),
    ]);
    const service = createContentService({
      repo: createSupabaseContentRepository(createSupabaseServiceClient()),
      publicBaseUrl: getAppUrl(),
    });
    return service.getPublicContentBySlug(data.slug);
  });

export const getRelatedStories = createServerFn({ method: "GET" })
  .inputValidator(publicStorySlugInputSchema)
  .handler(async ({ data }) => {
    const { loadRelatedStories } = await import("./publicStoriesPage.server");
    return loadRelatedStories(data.slug);
  });
