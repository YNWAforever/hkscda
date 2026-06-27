import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/exports/successful-adoptions.csv")({
  server: {
    handlers: {
      GET: ({ request }) =>
        createHandlers().exportCoordinatorCsv({
          request,
          params: { kind: "successful-adoptions" },
        }),
    },
  },
});
