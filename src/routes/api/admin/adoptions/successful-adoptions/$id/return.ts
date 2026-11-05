import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../../-handlers";

// BUG-33: record that an adopted animal came back (staff/admin; reason required).
export const Route = createFileRoute("/api/admin/adoptions/successful-adoptions/$id/return")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().recordAdoptionReturn({ request, params }),
    },
  },
});
