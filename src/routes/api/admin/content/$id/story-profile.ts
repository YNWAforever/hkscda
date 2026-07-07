import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/content/$id/story-profile")({
  server: {
    handlers: {
      PUT: ({ request, params }) => createHandlers().upsertStoryProfile({ request, params }),
    },
  },
});
