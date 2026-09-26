import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
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
});

type ClaimedContentMedia = PublicMediaAsset & { claimedAt: string };
export type ContentPublicationMediaRepairPort = {
  claim(): Promise<ClaimedContentMedia[]>;
  copy(row: ClaimedContentMedia): Promise<unknown>;
  markReady(row: ClaimedContentMedia): Promise<boolean>;
};

export async function repairContentPublicationMedia(
  port: ContentPublicationMediaRepairPort,
  logger: Pick<Console, "error"> = console,
): Promise<{ copied: number; failed: number }> {
  const summary = { copied: 0, failed: 0 };
  for (const row of await port.claim()) {
    try {
      await port.copy(row);
      if (!(await port.markReady(row))) throw new Error("Content media claim expired");
      summary.copied += 1;
    } catch (error) {
      logger.error("Failed to repair content publication media", {
        assetId: row.id,
        error,
      });
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
    async claim() {
      const cutoff = new Date(now().getTime() - REPAIR_DELAY_MS).toISOString();
      const { data, error } = await client.rpc("claim_due_content_public_assets", {
        p_cutoff: cutoff,
        p_limit: 50,
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
        }));
    },
    copy(row) {
      return media.copyPublic(row);
    },
    async markReady(row) {
      const { data, error } = await client.rpc("mark_claimed_content_public_asset_ready", {
        p_asset_id: row.id,
        p_claimed_at: row.claimedAt,
      });
      if (error) throw error;
      return data === true;
    },
  };
}
