import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  createPublicDocumentDownloadHandler,
  PUBLIC_DOCUMENT_BUCKET,
  PUBLIC_DOCUMENT_SIGNED_URL_TTL_SECONDS,
  type PublicDocumentAsset,
} from "../../../lib/documents/download.server";
import { createSupabaseServiceClient } from "../../../lib/supabase.server";

const eligibleAssetSchema = z.object({
  bucket_name: z.literal(PUBLIC_DOCUMENT_BUCKET),
  object_path: z.string(),
  mime_type: z.literal("application/pdf"),
});

/**
 * The public half of the document pipeline (migration 20261109104000). The RPC decides
 * eligibility from one database snapshot: published asset plus a published annual report,
 * document slot or knowledge post that references it.
 */
function liveHandler() {
  const client = createSupabaseServiceClient();
  return createPublicDocumentDownloadHandler({
    async findEligibleAsset(assetId): Promise<PublicDocumentAsset | null> {
      const { data, error } = await client.rpc("read_public_document_asset", {
        p_asset_id: assetId,
      });
      if (error) throw error;
      const parsed = eligibleAssetSchema.safeParse(data);
      if (!parsed.success) return null;
      return {
        bucketName: parsed.data.bucket_name,
        objectPath: parsed.data.object_path,
        mimeType: parsed.data.mime_type,
      };
    },
    async sign(bucketName, objectPath) {
      const { data, error } = await client.storage
        .from(bucketName)
        .createSignedUrl(objectPath, PUBLIC_DOCUMENT_SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) throw error ?? new Error("Storage did not sign the document");
      return data.signedUrl;
    },
  });
}

export const Route = createFileRoute("/api/documents/$assetId")({
  server: {
    handlers: {
      GET: async (context) => liveHandler()(context),
    },
  },
});
