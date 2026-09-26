import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "sponsorship-payment-proof";
const CLEANUP_GRACE_MS = 60 * 60 * 1000;

export type ClaimedSponsorshipProof = {
  pledgeId: string;
  storagePath: string;
  claimedAt: string;
};

export type SponsorshipProofCleanupPort = {
  claim(): Promise<ClaimedSponsorshipProof[]>;
  isReferenced(row: ClaimedSponsorshipProof): Promise<boolean>;
  remove(row: ClaimedSponsorshipProof): Promise<void>;
  preserve(row: ClaimedSponsorshipProof): Promise<void>;
  finish(row: ClaimedSponsorshipProof): Promise<void>;
  release(row: ClaimedSponsorshipProof): Promise<void>;
};

export async function cleanupExpiredSponsorshipProofUploads(
  port: SponsorshipProofCleanupPort,
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
        // A failed Storage response can follow a successful deletion. Keep
        // the claim after any delete attempt so a late proof cannot attach it.
        storageRemovalAttempted = true;
        await port.remove(row);
        await port.finish(row);
        summary.removed += 1;
      }
    } catch (error) {
      logger.error("Failed to clean up sponsorship proof upload", {
        pledgeId: row.pledgeId,
        error,
      });
      if (!storageRemovalAttempted) {
        try {
          await port.release(row);
        } catch (releaseError) {
          logger.error("Failed to release sponsorship proof cleanup claim", {
            pledgeId: row.pledgeId,
            error: releaseError,
          });
        }
      }
      summary.failed += 1;
    }
  }
  return summary;
}

type ClaimRow = {
  pledge_id: string;
  storage_path: string;
  claimed_at: string;
};

export function createSupabaseSponsorshipProofCleanupPort(
  client: SupabaseClient,
  now: () => Date = () => new Date(),
): SponsorshipProofCleanupPort {
  return {
    async claim() {
      const cutoff = new Date(now().getTime() - CLEANUP_GRACE_MS).toISOString();
      const { data, error } = await client.rpc("claim_expired_sponsorship_proof_uploads", {
        p_cutoff: cutoff,
        p_limit: 50,
      });
      if (error) throw error;
      return ((data ?? []) as ClaimRow[]).map((row) => ({
        pledgeId: row.pledge_id,
        storagePath: row.storage_path,
        claimedAt: row.claimed_at,
      }));
    },
    async isReferenced(row) {
      const { data, error } = await client
        .from("sponsorship_payment_proof")
        .select("pledge_id")
        .eq("pledge_id", row.pledgeId)
        .eq("storage_path", row.storagePath)
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
        .from("sponsorship_proof_upload_intent")
        .update({ submitted_at: now().toISOString(), cleanup_claimed_at: null })
        .eq("pledge_id", row.pledgeId)
        .eq("cleanup_claimed_at", row.claimedAt);
      if (error) throw error;
    },
    async finish(row) {
      const { error } = await client
        .from("sponsorship_proof_upload_intent")
        .delete()
        .eq("pledge_id", row.pledgeId)
        .eq("cleanup_claimed_at", row.claimedAt)
        .is("submitted_at", null);
      if (error) throw error;
    },
    async release(row) {
      const { error } = await client
        .from("sponsorship_proof_upload_intent")
        .update({ cleanup_claimed_at: null })
        .eq("pledge_id", row.pledgeId)
        .eq("cleanup_claimed_at", row.claimedAt);
      if (error) throw error;
    },
  };
}

/** Staff-upload paths are shared by retries. A proof insert fences cleanup via
 * the intent row lock, so Storage deletion only starts after a successful claim. */
export function createSupabaseStaffSponsorshipProofCleanupPort(
  client: SupabaseClient,
  now: () => Date = () => new Date(),
): SponsorshipProofCleanupPort {
  return {
    async claim() {
      const cutoff = new Date(now().getTime() - CLEANUP_GRACE_MS).toISOString();
      const { data, error } = await client.rpc("claim_expired_staff_sponsorship_proof_uploads", {
        p_cutoff: cutoff,
        p_limit: 50,
      });
      if (error) throw error;
      return ((data ?? []) as ClaimRow[]).map((row) => ({
        pledgeId: row.pledge_id,
        storagePath: row.storage_path,
        claimedAt: row.claimed_at,
      }));
    },
    async isReferenced(row) {
      const { data, error } = await client
        .from("sponsorship_payment_proof")
        .select("pledge_id")
        .eq("pledge_id", row.pledgeId)
        .eq("storage_path", row.storagePath)
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
        .from("sponsorship_staff_proof_upload_intent")
        .update({ attached_at: now().toISOString(), cleanup_claimed_at: null })
        .eq("storage_path", row.storagePath)
        .eq("cleanup_claimed_at", row.claimedAt);
      if (error) throw error;
    },
    async finish(row) {
      const { error } = await client
        .from("sponsorship_staff_proof_upload_intent")
        .delete()
        .eq("storage_path", row.storagePath)
        .eq("cleanup_claimed_at", row.claimedAt)
        .is("attached_at", null);
      if (error) throw error;
    },
    async release(row) {
      const { error } = await client
        .from("sponsorship_staff_proof_upload_intent")
        .update({ cleanup_claimed_at: null })
        .eq("storage_path", row.storagePath)
        .eq("cleanup_claimed_at", row.claimedAt);
      if (error) throw error;
    },
  };
}
