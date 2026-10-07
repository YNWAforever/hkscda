import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/animals/match-options")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listMatchableAnimals({ request }),
    },
  },
});
