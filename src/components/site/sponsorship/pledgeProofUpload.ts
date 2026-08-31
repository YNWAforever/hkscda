import { getSupabaseClient } from "../../../lib/supabase";

export type ProofUploadResult = { pledgeId: string; storagePath: string };

export type SponsorshipProofReference = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
};

export type PledgeSubmissionIds = {
  pledgeId: string;
  proof?: SponsorshipProofReference;
};

type ProofUploadUrlResponse = {
  pledgeId: string;
  upload: { path: string; token: string };
};

/**
 * Requests a signed upload URL for one payment-proof file, then uploads the
 * file bytes directly to Supabase Storage (never through the Vercel
 * function). Intentionally does NOT send a `turnstileToken` — the
 * proof-upload-url endpoint doesn't check one (Turnstile tokens are
 * single-use; the token is verified exactly once, at the final
 * `POST /api/sponsorships/pledges` submission).
 */
export async function uploadProofDirectly(proofFile: File): Promise<ProofUploadResult> {
  const urlResponse = await fetch("/api/sponsorships/pledges/proof-upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      proof: {
        fileName: proofFile.name,
        mimeType: proofFile.type,
        sizeBytes: proofFile.size,
      },
    }),
  });
  const urlResult = await urlResponse.json().catch(() => ({}));
  if (!urlResponse.ok) {
    throw new Error(
      typeof urlResult.error === "string" ? urlResult.error : "無法準備付款證明上傳。",
    );
  }
  const { pledgeId, upload } = urlResult as ProofUploadUrlResponse;

  const client = getSupabaseClient();
  const { error } = await client.storage
    .from("sponsorship-payment-proof")
    .uploadToSignedUrl(upload.path, upload.token, proofFile, {
      contentType: proofFile.type,
    });
  if (error) {
    console.error(error);
    throw new Error("付款證明上傳失敗，請重試。");
  }

  return { pledgeId, storagePath: upload.path };
}

/**
 * Resolves the `pledgeId` and (optional) proof reference to send with the
 * final pledge submission. When a proof file is attached, it is uploaded
 * directly to Storage first and the pledgeId minted by the upload-url
 * endpoint is reused. When there is no proof, a pledge still needs a
 * pre-allocated id -- Task 6's `parseSponsorshipSubmission` requires
 * `pledgeId` unconditionally, even for proof-less submissions -- so one is
 * generated fresh here.
 */
export async function resolvePledgeSubmissionIds(
  includeProof: boolean,
  proofFile: File | null,
): Promise<PledgeSubmissionIds> {
  if (includeProof && proofFile) {
    const uploadResult = await uploadProofDirectly(proofFile);
    return {
      pledgeId: uploadResult.pledgeId,
      proof: {
        fileName: proofFile.name,
        mimeType: proofFile.type,
        sizeBytes: proofFile.size,
        storagePath: uploadResult.storagePath,
      },
    };
  }
  return { pledgeId: crypto.randomUUID() };
}
