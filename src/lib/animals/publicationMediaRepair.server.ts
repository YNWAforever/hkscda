import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  MEDIA_REPAIR_BATCH_LIMIT,
  MEDIA_REPAIR_TIME_BUDGET_MS,
  nextMediaRepairRetryAt,
} from "../publicUploads/mediaRepairPolicy";
import { copyAnimalPublicationMediaBytes } from "./publicationMedia.server";

const REPAIR_DELAY_MS = 5 * 60 * 1000;
const claimedSchema = z.array(
  z.object({
    source_path: z.string(),
    public_path: z.string(),
    claimed_at: z.string(),
    lease_token: z.string().uuid(),
    attempts: z.number().int().min(1).max(8),
  }),
);

export type ClaimedAnimalPublicationMedia = {
  sourcePath: string;
  publicPath: string;
  claimedAt: string;
  leaseToken: string;
  attempts: number;
};

export type AnimalPublicationMediaRepairPort = {
  claim(limit: number): Promise<ClaimedAnimalPublicationMedia[]>;
  copy(row: ClaimedAnimalPublicationMedia): Promise<void>;
  markReady(row: ClaimedAnimalPublicationMedia): Promise<boolean>;
  markFailure(
    row: ClaimedAnimalPublicationMedia,
    nextRetryAt: string,
    errorCode: string,
  ): Promise<boolean>;
};

type RepairOptions = {
  now?: () => Date;
  maxItems?: number;
  timeBudgetMs?: number;
};

export async function repairAnimalPublicationMedia(
  port: AnimalPublicationMediaRepairPort,
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
        logger.error("Animal media repair lost its lease", { publicPath: row.publicPath });
        summary.failed += 1;
        continue;
      }
      summary.copied += 1;
    } catch {
      await port.markFailure(row, nextMediaRepairRetryAt(row.attempts, now()), errorCode);
      logger.error("Failed to repair animal publication media", {
        publicPath: row.publicPath,
        errorCode,
      });
      summary.failed += 1;
    }
  }
  return summary;
}

export function createSupabaseAnimalPublicationMediaRepairPort(
  client: SupabaseClient,
  now: () => Date = () => new Date(),
): AnimalPublicationMediaRepairPort {
  return {
    async claim(limit) {
      const cutoff = new Date(now().getTime() - REPAIR_DELAY_MS).toISOString();
      const { data, error } = await client.rpc("claim_due_animal_publication_media_copies", {
        p_cutoff: cutoff,
        p_limit: limit,
      });
      if (error) throw error;
      return claimedSchema.parse(data ?? []).map((row) => ({
        sourcePath: row.source_path,
        publicPath: row.public_path,
        claimedAt: row.claimed_at,
        leaseToken: row.lease_token,
        attempts: row.attempts,
      }));
    },
    copy(row) {
      return copyAnimalPublicationMediaBytes(client, row);
    },
    async markReady(row) {
      const { data, error } = await client.rpc("mark_repaired_animal_publication_media", {
        p_public_path: row.publicPath,
        p_lease_token: row.leaseToken,
      });
      if (error) throw error;
      return data === true;
    },
    async markFailure(row, nextRetryAt, errorCode) {
      const { data, error } = await client.rpc("fail_animal_publication_media_copy", {
        p_public_path: row.publicPath,
        p_lease_token: row.leaseToken,
        p_next_retry_at: nextRetryAt,
        p_error_code: errorCode,
      });
      if (error) throw error;
      return data === true;
    },
  };
}
