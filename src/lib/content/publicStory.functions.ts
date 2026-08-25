import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getPublicStory = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().trim().min(1).max(160) }))
  .handler(async ({ data }) => {
    const [{ createSupabaseContentRepository }, { createContentService }, { createSupabaseServiceClient }] =
      await Promise.all([
        import("./repository.server"),
        import("./service"),
        import("../donations/supabase.server"),
      ]);
    const service = createContentService({
      repo: createSupabaseContentRepository(createSupabaseServiceClient()),
      publicBaseUrl: process.env.APP_URL ?? "https://hkscda.vercel.app",
    });
    return service.getPublicContentBySlug(data.slug);
  });
