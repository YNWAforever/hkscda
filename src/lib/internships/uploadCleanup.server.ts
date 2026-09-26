import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "internship-private";
const CLEANUP_GRACE_MS = 60 * 60 * 1000;

export type ClaimedInternshipUpload = { storagePath: string; claimedAt: string };

export type InternshipUploadCleanupPort = {
  claim(): Promise<ClaimedInternshipUpload[]>;
  isReferenced(row: ClaimedInternshipUpload): Promise<boolean>;
  remove(row: ClaimedInternshipUpload): Promise<void>;
  preserve(row: ClaimedInternshipUpload): Promise<void>;
  finish(row: ClaimedInternshipUpload): Promise<void>;
  release(row: ClaimedInternshipUpload): Promise<void>;
};

export async function cleanupExpiredInternshipUploads(
  port: InternshipUploadCleanupPort,
  logger: Pick<Console, "error"> = console,
): Promise<{ removed: number; preserved: number; failed: number }> {
  const summary = { removed: 0, preserved: 0, failed: 0 };
  for (const row of await port.claim()) {
    let storageRemovalAttempted = false;
    try {
      if (await port.isReferenced(row)) {
        await port.preserve(row);
        summary.preserved += 1;
      } else {
        // A failed Storage response may follow a successful deletion. Keep
        // the claim after any delete attempt to fence late attachments.
        storageRemovalAttempted = true;
        await port.remove(row);
        await port.finish(row);
        summary.removed += 1;
      }
    } catch (error) {
      logger.error("Failed to clean up internship attachment upload", {
        storagePath: row.storagePath,
        error,
      });
      if (!storageRemovalAttempted) {
        try {
          await port.release(row);
        } catch (releaseError) {
          logger.error("Failed to release internship attachment cleanup claim", {
            storagePath: row.storagePath,
            error: releaseError,
          });
        }
      }
      summary.failed += 1;
    }
  }
  return summary;
}

type ClaimRow = { storage_path: string; claimed_at: string };

export function createSupabaseInternshipUploadCleanupPort(
  client: SupabaseClient,
  now: () => Date = () => new Date(),
): InternshipUploadCleanupPort {
  return {
    async claim() {
      const cutoff = new Date(now().getTime() - CLEANUP_GRACE_MS).toISOString();
      const { data, error } = await client.rpc("claim_expired_internship_attachment_uploads", {
        p_cutoff: cutoff,
        p_limit: 50,
      });
      if (error) throw error;
      return ((data ?? []) as ClaimRow[]).map((row) => ({
        storagePath: row.storage_path,
        claimedAt: row.claimed_at,
      }));
    },
    async isReferenced(row) {
      const { data, error } = await client
        .from("internship_attachment")
        .select("id")
        .eq("object_path", row.storagePath)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async remove(row) {
      const { error } = await client.storage.from(BUCKET).remove([row.storagePath]);
      if (error) throw error;
    },
    async preserve(row) {
      const { error } = await client
        .from("internship_attachment_upload_intent")
        .update({ attached_at: now().toISOString(), cleanup_claimed_at: null })
        .eq("storage_path", row.storagePath)
        .eq("cleanup_claimed_at", row.claimedAt);
      if (error) throw error;
    },
    async finish(row) {
      const { error } = await client
        .from("internship_attachment_upload_intent")
        .update({ cleaned_at: now().toISOString() })
        .eq("storage_path", row.storagePath)
        .eq("cleanup_claimed_at", row.claimedAt)
        .is("attached_at", null);
      if (error) throw error;
    },
    async release(row) {
      const { error } = await client
        .from("internship_attachment_upload_intent")
        .update({ cleanup_claimed_at: null })
        .eq("storage_path", row.storagePath)
        .eq("cleanup_claimed_at", row.claimedAt)
        .is("cleaned_at", null);
      if (error) throw error;
    },
  };
}
