import { createFileRoute } from "@tanstack/react-router";
import {
  requireAdmin,
  createSupabaseServiceClient,
} from "../../../../../lib/donations/supabase.server";
import {
  createPublicationMetadataHandler,
  createSupabasePublicationMetadataUpdater,
} from "../../../../../lib/content/publicationMetadata.server";

export const Route = createFileRoute("/api/admin/content/$id/publication-metadata")({
  server: {
    handlers: {
      PUT: ({ request, params }) => {
        const client = createSupabaseServiceClient();
        return createPublicationMetadataHandler({
          requireAdmin: (input) => requireAdmin(input, ["staff", "admin"], client),
          update: createSupabasePublicationMetadataUpdater(client),
        })(request, params.id);
      },
    },
  },
});
