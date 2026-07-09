import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/animals/pipeline")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listAnimalPipeline({ request }),
    },
  },
});
