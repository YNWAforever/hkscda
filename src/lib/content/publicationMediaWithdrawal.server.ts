import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { MEDIA_REPAIR_TIME_BUDGET_MS } from "../publicUploads/mediaRepairPolicy";

// BUG-72: public copies of story images that the current published revision no longer uses
// are recorded as withdrawn by the database (publish/archive trigger) and deleted here.
export const CONTENT_MEDIA_WITHDRAWAL_BATCH_LIMIT = 50;

/** The only shape of object this job may delete: published/<revision>/<media>.<ext>. */
const PUBLISHED_COPY_PATH =
  /^published\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export type WithdrawnContentMedia = {
  id: string;
  publicBucket: "content-media";
  publicPath: string;
  leaseToken: string;
};

export type ContentPublicationMediaWithdrawalPort = {
  /** Leases withdrawn copies; never returns a copy of an item's current published revision. */
  claim(limit: number): Promise<WithdrawnContentMedia[]>;
  /** Deletes the public object. Deleting an object that is already gone must succeed. */
  remove(row: WithdrawnContentMedia): Promise<unknown>;
  /** Records the deletion under the lease; false when the lease was lost. */
  markRemoved(row: WithdrawnContentMedia): Promise<boolean>;
};

type WithdrawalOptions = {
  now?: () => Date;
  maxItems?: number;
  timeBudgetMs?: number;
};

export async function withdrawContentPublicationMedia(
  port: ContentPublicationMediaWithdrawalPort,
  logger: Pick<Console, "error"> = console,
  options: WithdrawalOptions = {},
): Promise<{ removed: number; failed: number }> {
  const now = options.now ?? (() => new Date());
  const deadline = now().getTime() + (options.timeBudgetMs ?? MEDIA_REPAIR_TIME_BUDGET_MS);
  const maxItems = Math.min(
    options.maxItems ?? CONTENT_MEDIA_WITHDRAWAL_BATCH_LIMIT,
    CONTENT_MEDIA_WITHDRAWAL_BATCH_LIMIT,
  );
  const summary = { removed: 0, failed: 0 };
  for (let item = 0; item < maxItems && now().getTime() < deadline; item++) {
    const [row] = await port.claim(1);
    if (!row) break;
    if (row.publicBucket !== "content-media" || !PUBLISHED_COPY_PATH.test(row.publicPath)) {
      // Left leased and unremoved for an operator: never delete an unexpected path.
      logger.error("Refusing to withdraw an unexpected content media path", { assetId: row.id });
      summary.failed += 1;
      continue;
    }
    try {
      await port.remove(row);
    } catch {
      // The row stays withdrawn and unremoved; its lease expires and the next run retries.
      logger.error("Failed to withdraw content publication media", { assetId: row.id });
      summary.failed += 1;
      continue;
    }
    try {
      if (await port.markRemoved(row)) {
        summary.removed += 1;
        continue;
      }
      logger.error("Content media withdrawal lost its lease", { assetId: row.id });
    } catch {
      // Deleting again on the next run is harmless.
      logger.error("Failed to record content media withdrawal", { assetId: row.id });
    }
    summary.failed += 1;
  }
  return summary;
}

const claimedSchema = z.object({
  id: z.string().uuid(),
  public_bucket: z.literal("content-media"),
  public_path: z.string(),
  withdrawn_at: z.string(),
  removed_at: z.null(),
  removal_lease_token: z.string().uuid(),
});

export function createSupabaseContentPublicationMediaWithdrawalPort(
  client: SupabaseClient,
): ContentPublicationMediaWithdrawalPort {
  return {
    async claim(limit) {
      const { data, error } = await client.rpc("claim_withdrawn_content_public_assets", {
        p_limit: limit,
      });
      if (error) throw error;
      return z
        .array(claimedSchema)
        .parse(data ?? [])
        .map((row) => ({
          id: row.id,
          publicBucket: row.public_bucket,
          publicPath: row.public_path,
          leaseToken: row.removal_lease_token,
        }));
    },
    async remove(row) {
      const { error } = await client.storage.from(row.publicBucket).remove([row.publicPath]);
      if (error) throw error;
    },
    async markRemoved(row) {
      const { data, error } = await client.rpc("mark_content_public_asset_removed", {
        p_asset_id: row.id,
        p_lease_token: row.leaseToken,
      });
      if (error) throw error;
      return data === true;
    },
  };
}
