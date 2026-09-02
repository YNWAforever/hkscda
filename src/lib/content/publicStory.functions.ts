import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getPublicStory = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().trim().min(1).max(160) }))
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
