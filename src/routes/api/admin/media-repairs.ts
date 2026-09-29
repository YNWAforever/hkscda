import { createFileRoute } from "@tanstack/react-router";
import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";
import {
  createMediaRepairAdminHandler,
  createSupabaseMediaRepairAdminPorts,
} from "../../../lib/publicUploads/mediaRepairAdmin.server";

export const Route = createFileRoute("/api/admin/media-repairs")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const client = createSupabaseServiceClient();
        return createMediaRepairAdminHandler({
          requireAdmin: (input) => requireAdmin(input, ["staff", "admin"], client),
          ...createSupabaseMediaRepairAdminPorts(client),
        }).list(request);
      },
      POST: ({ request }) => {
        const client = createSupabaseServiceClient();
        return createMediaRepairAdminHandler({
          requireAdmin: (input) => requireAdmin(input, ["staff", "admin"], client),
          ...createSupabaseMediaRepairAdminPorts(client),
        }).retry(request);
      },
    },
  },
});
