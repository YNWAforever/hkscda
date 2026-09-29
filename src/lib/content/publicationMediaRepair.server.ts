import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  MEDIA_REPAIR_BATCH_LIMIT,
  MEDIA_REPAIR_TIME_BUDGET_MS,
  nextMediaRepairRetryAt,
} from "../publicUploads/mediaRepairPolicy";
import { createSupabaseContentMediaPorts } from "./mediaLifecycle.repository.server";
import type { PublicMediaAsset } from "./mediaLifecycle.server";

const REPAIR_DELAY_MS = 5 * 60 * 1000;
const claimedAssetSchema = z.object({
  id: z.string().uuid(),
  source_bucket: z.literal("content-media-private"),
  source_path: z.string(),
  public_bucket: z.literal("content-media"),
  public_path: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  ready: z.literal(false),
  copy_claimed_at: z.string(),
  lease_token: z.string().uuid(),
  repair_attempts: z.number().int().min(1).max(8),
});

type ClaimedContentMedia = PublicMediaAsset & {
  claimedAt: string;
  leaseToken: string;
  attempts: number;
};
export type ContentPublicationMediaRepairPort = {
  claim(limit: number): Promise<ClaimedContentMedia[]>;
  copy(row: ClaimedContentMedia): Promise<unknown>;
  markReady(row: ClaimedContentMedia): Promise<boolean>;
  markFailure(row: ClaimedContentMedia, nextRetryAt: string, errorCode: string): Promise<boolean>;
};

type RepairOptions = {
  now?: () => Date;
  maxItems?: number;
  timeBudgetMs?: number;
};

export async function repairContentPublicationMedia(
  port: ContentPublicationMediaRepairPort,
  logger: Pick<Console, "error"> = console,
  options: RepairOptions = {},
): Promise<{ copied: number; failed: number }> {
  const now = options.now ?? (() => new Date());
  const deadline = now().getTime() + (options.timeBudgetMs ?? MEDIA_REPAIR_TIME_BUDGET_MS);
  const maxItems = Math.min(options.maxItems ?? MEDIA_REPAIR_BATCH_LIMIT, MEDIA_REPAIR_BATCH_LIMIT);
  const summary = { copied: 0, failed: 0 };
  for (let item = 0; item < maxItems && now().getTime() < deadline; item++) {
    const [row] = await port.claim(1);
    if (!row) break;
    let errorCode = "copy_failed";
    try {
      await port.copy(row);
      errorCode = "ack_failed";
      if (!(await port.markReady(row))) {
        logger.error("Content media repair lost its lease", { assetId: row.id });
        summary.failed += 1;
        continue;
      }
      summary.copied += 1;
    } catch {
      await port.markFailure(row, nextMediaRepairRetryAt(row.attempts, now()), errorCode);
      logger.error("Failed to repair content publication media", { assetId: row.id, errorCode });
      summary.failed += 1;
    }
  }
  return summary;
}

export function createSupabaseContentPublicationMediaRepairPort(
  client: SupabaseClient,
  now: () => Date = () => new Date(),
): ContentPublicationMediaRepairPort {
  const media = createSupabaseContentMediaPorts(client);
  return {
    async claim(limit) {
      const cutoff = new Date(now().getTime() - REPAIR_DELAY_MS).toISOString();
      const { data, error } = await client.rpc("claim_due_content_public_assets", {
        p_cutoff: cutoff,
        p_limit: limit,
      });
      if (error) throw error;
      return z
        .array(claimedAssetSchema)
        .parse(data ?? [])
        .map((row) => ({
          id: row.id,
          sourceBucket: row.source_bucket,
          sourcePath: row.source_path,
          publicBucket: row.public_bucket,
          publicPath: row.public_path,
          sha256: row.sha256,
          ready: row.ready,
          claimedAt: row.copy_claimed_at,
          leaseToken: row.lease_token,
          attempts: row.repair_attempts,
        }));
    },
    copy(row) {
      return media.copyPublic(row);
    },
    async markReady(row) {
      const { data, error } = await client.rpc("mark_repaired_content_public_asset", {
        p_asset_id: row.id,
        p_lease_token: row.leaseToken,
      });
      if (error) throw error;
      return data === true;
    },
    async markFailure(row, nextRetryAt, errorCode) {
      const { data, error } = await client.rpc("fail_content_public_asset_copy", {
        p_asset_id: row.id,
        p_lease_token: row.leaseToken,
        p_next_retry_at: nextRetryAt,
        p_error_code: errorCode,
      });
      if (error) throw error;
      return data === true;
    },
  };
}
