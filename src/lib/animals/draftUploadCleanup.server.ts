import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "animal-draft-images";
const CLEANUP_GRACE_MS = 60 * 60 * 1000;

export type ClaimedAnimalDraftUpload = {
  animalId: string;
  storagePath: string;
  claimedAt: string;
};

export type AnimalDraftUploadCleanupPort = {
  claim(): Promise<ClaimedAnimalDraftUpload[]>;
  remove(row: ClaimedAnimalDraftUpload): Promise<void>;
  finish(row: ClaimedAnimalDraftUpload): Promise<void>;
};

export async function cleanupExpiredAnimalDraftUploads(
  port: AnimalDraftUploadCleanupPort,
  logger: Pick<Console, "error"> = console,
): Promise<{ removed: number; failed: number }> {
  const summary = { removed: 0, failed: 0 };
  for (const row of await port.claim()) {
    try {
      await port.remove(row);
      await port.finish(row);
      summary.removed += 1;
    } catch (error) {
      // A failed Storage response may still follow a successful deletion.
      // Keep the claim so a late draft save cannot attach a missing object;
      // the claim RPC permits a retry after its one-hour lease.
      logger.error("Failed to clean up animal draft upload", {
        animalId: row.animalId,
        error,
      });
      summary.failed += 1;
    }
  }
  return summary;
}

type ClaimRow = {
  animal_id: string;
  storage_path: string;
  claimed_at: string;
};

export function createSupabaseAnimalDraftUploadCleanupPort(
  client: SupabaseClient,
  now: () => Date = () => new Date(),
): AnimalDraftUploadCleanupPort {
  return {
    async claim() {
      const cutoff = new Date(now().getTime() - CLEANUP_GRACE_MS).toISOString();
      const { data, error } = await client.rpc("claim_expired_animal_draft_image_uploads", {
        p_cutoff: cutoff,
        p_limit: 50,
      });
      if (error) throw error;
      return ((data ?? []) as ClaimRow[]).map((row) => ({
        animalId: row.animal_id,
        storagePath: row.storage_path,
        claimedAt: row.claimed_at,
      }));
    },
    async remove(row) {
      const { error } = await client.storage.from(BUCKET).remove([row.storagePath]);
      if (error) throw error;
    },
    async finish(row) {
      const { error } = await client
        .from("animal_draft_image_upload_intent")
        .delete()
        .eq("storage_path", row.storagePath)
        .eq("cleanup_claimed_at", row.claimedAt)
        .is("attached_at", null);
      if (error) throw error;
    },
  };
}
