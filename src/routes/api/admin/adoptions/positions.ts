import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/adoptions/positions")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listAnimalPositions({ request }),
    },
  },
});
