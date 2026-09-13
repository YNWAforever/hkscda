import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient, requireAdmin } from "../../donations/supabase.server";
import { createDirectoryHandler } from "./http.server";
import type { DirectoryQuery } from "./schemas";
import type { DirectoryList, DirectoryDetail } from "./types";
export function createDirectoryRepository(client: SupabaseClient) {
  return async (
    actor: string,
    input: DirectoryQuery,
  ): Promise<DirectoryList | DirectoryDetail | null> => {
    const { data, error } = await client.rpc("volunteer_admin_directory_read", {
      p_actor: actor,
      p_query: input,
    });
    if (error) throw error;
    return data as DirectoryList | DirectoryDetail | null;
  };
}
export async function handleDirectoryRequest(request: Request) {
  const client = createSupabaseServiceClient();
  return createDirectoryHandler({
    authorize: async (req) => (await requireAdmin(req, ["staff", "admin"], client)).authUserId,
    read: createDirectoryRepository(client),
  })(request);
}
