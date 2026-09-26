import type { SupabaseClient } from "@supabase/supabase-js";

import { copyPublishedAnimalMedia } from "./publicationMedia.server";

const REPAIR_DELAY_MS = 5 * 60 * 1000;

export type ClaimedAnimalPublicationMedia = {
  sourcePath: string;
  publicPath: string;
  claimedAt: string;
};

export type AnimalPublicationMediaRepairPort = {
  claim(): Promise<ClaimedAnimalPublicationMedia[]>;
  copy(row: ClaimedAnimalPublicationMedia): Promise<void>;
};

export async function repairAnimalPublicationMedia(
  port: AnimalPublicationMediaRepairPort,
  logger: Pick<Console, "error"> = console,
): Promise<{ copied: number; failed: number }> {
  const summary = { copied: 0, failed: 0 };
  for (const row of await port.claim()) {
    try {
      await port.copy(row);
      summary.copied += 1;
    } catch (error) {
      // The SQL claim expires after one hour. A retry accepts an object that
      // was uploaded before an ambiguous Storage or database response.
      logger.error("Failed to repair animal publication media", {
        publicPath: row.publicPath,
        error,
      });
      summary.failed += 1;
    }
  }
  return summary;
}

type ClaimRow = {
  source_path: string;
  public_path: string;
  claimed_at: string;
};

export function createSupabaseAnimalPublicationMediaRepairPort(
  client: SupabaseClient,
  now: () => Date = () => new Date(),
): AnimalPublicationMediaRepairPort {
  return {
    async claim() {
      const cutoff = new Date(now().getTime() - REPAIR_DELAY_MS).toISOString();
      const { data, error } = await client.rpc("claim_due_animal_publication_media_copies", {
        p_cutoff: cutoff,
        p_limit: 50,
      });
      if (error) throw error;
      return ((data ?? []) as ClaimRow[]).map((row) => ({
        sourcePath: row.source_path,
        publicPath: row.public_path,
        claimedAt: row.claimed_at,
      }));
    },
    copy(row) {
      return copyPublishedAnimalMedia(client, row, row.claimedAt);
    },
  };
}
