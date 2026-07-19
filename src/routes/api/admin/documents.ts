import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./documents/-handlers";

export const Route = createFileRoute("/api/admin/documents")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listAssets({ request }),
      POST: ({ request }) => createHandlers().createAsset({ request }),
    },
  },
});
