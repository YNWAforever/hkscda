import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/adoptions/tasks")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listTasks({ request }),
      POST: ({ request }) => createHandlers().createTask({ request }),
    },
  },
});
