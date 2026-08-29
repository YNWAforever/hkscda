import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { validateProofDescriptor } from "../../../../../lib/sponsorship/schemas";
import { SPONSORSHIP_PROOF_BUCKET } from "../../../../../lib/sponsorship/submission.server";
import { jsonResponse, withErrors } from "../../../../../lib/sponsorshipAdmin/http.server";
import type { AdminUser } from "../../../../../lib/donations/supabase.server";
import type { createSponsorshipAdminService } from "../../../../../lib/sponsorshipAdmin/service";

type SponsorshipAdminService = ReturnType<typeof createSponsorshipAdminService>;

export type RecordPaymentUploadContext = {
  request: Request;
  pledgeId: string;
  client: Pick<SupabaseClient, "storage">;
  service: Pick<SponsorshipAdminService, "assertRecordPaymentEligible" | "recordPayment">;
  requireCoordinator: (request: Request) => Promise<AdminUser>;
};

export function safeFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || "proof";
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_");
}

/**
 * Parses the multipart body, uploads the proof file (if provided) to
 * storage, and delegates persistence/notification to the already-tested
 * `service.recordPayment`. Eligibility is checked *before* the upload (via
 * `assertRecordPaymentEligible`) so a pledge that is not eligible for a
 * recorded payment never leaves an orphaned file in the bucket. If the
 * upload succeeds but the subsequent `recordPayment` call still fails, the
 * uploaded file is removed so nothing is left behind.
 *
 * Error mapping (missing/invalid payload, domain conflicts, not-found, and
 * the "file required" bad-request case) is delegated to the shared
 * `withErrors`/`domainError` mapping in `http.server.ts` so this route can't
 * drift out of sync with the JSON `recordPayment` handler again.
 */
export async function handleRecordPaymentUpload({
  request,
  pledgeId,
  client,
  service,
  requireCoordinator,
}: RecordPaymentUploadContext) {
  let uploadedStoragePath: string | undefined;

  return withErrors(async () => {
    try {
      const admin = await requireCoordinator(request);

      const formData = await request.formData();
      const payloadValue = formData.get("payload");
      if (typeof payloadValue !== "string") {
        return jsonResponse({ error: "Missing payment payload" }, { status: 400 });
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(payloadValue);
      } catch {
        return jsonResponse({ error: "Invalid payment payload" }, { status: 400 });
      }

      const fileValue = formData.get("file");
      let file:
        | { storagePath: string; fileName: string; fileType: string; fileSize: number }
        | undefined;

      if (fileValue instanceof File) {
        // Validate eligibility before touching storage so a rejected
        // (ineligible-status) request never leaves an orphaned file behind.
        await service.assertRecordPaymentEligible(pledgeId);

        const descriptor = validateProofDescriptor({
          fileName: fileValue.name,
          mimeType: fileValue.type,
          sizeBytes: fileValue.size,
        });
        const storagePath = `${pledgeId}/staff-${Date.now()}-${safeFileName(descriptor.fileName)}`;
        const upload = await client.storage
          .from(SPONSORSHIP_PROOF_BUCKET)
          .upload(storagePath, fileValue, { contentType: descriptor.mimeType, upsert: false });
        if (upload.error) throw upload.error;

        uploadedStoragePath = upload.data?.path ?? storagePath;
        file = {
          storagePath: uploadedStoragePath,
          fileName: descriptor.fileName,
          fileType: descriptor.mimeType,
          fileSize: descriptor.sizeBytes,
        };
      }

      const result = await service.recordPayment({
        actorUserId: admin.authUserId,
        pledgeId,
        input: { ...payload, file },
      });

      return jsonResponse({ proof: result }, { status: 201 });
    } catch (error) {
      if (uploadedStoragePath) {
        await client.storage.from(SPONSORSHIP_PROOF_BUCKET).remove([uploadedStoragePath]);
      }
      if (error instanceof z.ZodError) {
        return jsonResponse({ error: "Invalid payment proof request" }, { status: 400 });
      }
      throw error;
    }
  }, "Could not record sponsorship payment");
}
