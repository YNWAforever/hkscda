import { createFileRoute } from "@tanstack/react-router";
import { handleDirectoryRequest } from "../../../../lib/volunteers/directory/repository.server";
export const Route = createFileRoute("/api/admin/volunteers/people")({
  server: { handlers: { GET: ({ request }) => handleDirectoryRequest(request) } },
});
