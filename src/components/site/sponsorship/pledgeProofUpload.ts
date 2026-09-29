import { getSupabaseClient } from "../../../lib/supabase";

export class ProofUploadRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProofUploadRequestError";
  }
}

export type ProofUploadResult = { pledgeId: string; storagePath: string; proofIntent: string };

export type SponsorshipProofReference = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  proofIntent: string;
};

export type PledgeSubmissionIds = {
  pledgeId: string;
  statusToken: string;
  proof?: SponsorshipProofReference;
};

type ProofUploadUrlResponse = {
  pledgeId: string;
  upload: { path: string; token: string };
  proofIntent: string;
};

/** The upload URL consumes the single-use challenge; final submission uses the signed intent. */
export async function uploadProofDirectly(
  proofFile: File,
  turnstileToken: string | null,
): Promise<ProofUploadResult> {
  const urlResponse = await fetch("/api/sponsorships/pledges/proof-upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(turnstileToken ? { turnstileToken } : {}),
      proof: {
        fileName: proofFile.name,
        mimeType: proofFile.type,
        sizeBytes: proofFile.size,
      },
    }),
  });
  const urlResult = await urlResponse.json().catch(() => ({}));
  if (!urlResponse.ok) {
    throw new ProofUploadRequestError(
      typeof urlResult.error === "string" ? urlResult.error : "無法準備付款證明上傳。",
      urlResponse.status,
    );
  }
  const { pledgeId, upload, proofIntent } = urlResult as ProofUploadUrlResponse;

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

  return { pledgeId, storagePath: upload.path, proofIntent };
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
/** 32 cryptographically random bytes; only a hash is persisted server-side. */
function createPledgeStatusToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export async function resolvePledgeSubmissionIds(
  includeProof: boolean,
  proofFile: File | null,
  turnstileToken: string | null,
): Promise<PledgeSubmissionIds> {
  if (includeProof && proofFile) {
    const uploadResult = await uploadProofDirectly(proofFile, turnstileToken);
    return {
      pledgeId: uploadResult.pledgeId,
      statusToken: createPledgeStatusToken(),
      proof: {
        fileName: proofFile.name,
        mimeType: proofFile.type,
        sizeBytes: proofFile.size,
        storagePath: uploadResult.storagePath,
        proofIntent: uploadResult.proofIntent,
      },
    };
  }
  return { pledgeId: crypto.randomUUID(), statusToken: createPledgeStatusToken() };
}

/** Keep one upload/id for one form submission, including HTTP retries. */
export function createPledgeSubmissionAttempt() {
  let prepared: {
    includeProof: boolean;
    proofFile: File | null;
    promise: Promise<PledgeSubmissionIds>;
  } | null = null;

  return {
    resolve(includeProof: boolean, proofFile: File | null, turnstileToken: string | null) {
      if (prepared && prepared.includeProof === includeProof && prepared.proofFile === proofFile) {
        return prepared.promise;
      }

      const promise = resolvePledgeSubmissionIds(includeProof, proofFile, turnstileToken);
      prepared = { includeProof, proofFile, promise };
      // A failed upload must be prepared again on retry. Once prepared, a
      // failed pledge request keeps this id so it cannot create a second row.
      void promise.catch(() => {
        if (prepared?.promise === promise) prepared = null;
      });
      return promise;
    },
    reset() {
      prepared = null;
    },
  };
}
