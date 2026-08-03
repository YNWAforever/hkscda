import { createDocumentHandlers } from "../../../../lib/documents/http.server";
import { createSupabaseDocumentRepository } from "../../../../lib/documents/repository.server";
import { createDocumentService } from "../../../../lib/documents/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createDocumentHandlers({
    requireDocumentAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createDocumentService({ repo: createSupabaseDocumentRepository(client) }),
  });
}
