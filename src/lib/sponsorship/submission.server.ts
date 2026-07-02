import { ZodError } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createStatusTokenPair, statusTokenExpiry } from "../publicAdoption/statusToken.server";
import { renderPledgeConfirmationEmail } from "./emailTemplates.server";
import {
  type SponsorshipPaymentProofMetadata,
  type SponsorshipPledgeStatus,
  type SponsorshipPledgeSubmission,
  type SponsorshipProofDescriptor,
  MAX_PROOF_BYTES,
  sponsorshipPledgeSubmissionSchema,
  toPaymentProofInsert,
  toPledgeInsert,
  toPreferenceInserts,
  validateProofDescriptor,
} from "./schemas";
import { getAppUrl, getEmailConfig } from "../donations/config.server";

export const SPONSORSHIP_PROOF_BUCKET = "sponsorship-payment-proof";
export const SPONSORSHIP_MULTIPART_MAX_BYTES = MAX_PROOF_BYTES + 2 * 1024 * 1024;

export class SubmissionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionValidationError";
  }
}

export type ParsedSponsorshipPayload = SponsorshipPledgeSubmission & {
  turnstileToken?: string;
};

export type ParsedSponsorshipProof = SponsorshipProofDescriptor & {
  file: File;
  metadata: SponsorshipPaymentProofMetadata;
};

export type ParsedSponsorshipMultipart = {
  payload: ParsedSponsorshipPayload;
  proof?: ParsedSponsorshipProof;
};

export type SponsorshipPledgePersistResult = {
  pledgeId: string;
  supporterId: string;
  reference: string;
  status: SponsorshipPledgeStatus;
  amountCents: number;
  statusToken: string;
  statusUrl: string;
  expiresAt: string;
};

type QueryResult<T = unknown> = {
  data: T | null;
  error: unknown;
};

export type PublicSponsorshipSupabaseClient = SupabaseClient;

export type SponsorshipSubmissionHeaderValidation =
  | { ok: true }
  | { ok: false; status: 400 | 413 | 415; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNoError<T>(result: QueryResult<T>, message: string): T | null {
  if (result.error) throw result.error;
  return result.data ?? null;
}

function isFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function safeFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || "proof";
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_");
}

function referenceForPledge(pledgeId: string) {
  const compact = pledgeId.replaceAll("-", "").toUpperCase().padEnd(8, "0");
  return `SP-${compact.slice(0, 8)}`;
}

function buildStatusUrl(appUrl: string, rawToken: string) {
  return `${appUrl.replace(/\/+$/, "")}/sponsors/status/${encodeURIComponent(rawToken)}`;
}

export function validateSponsorshipSubmissionRequestHeaders(
  request: Request,
): SponsorshipSubmissionHeaderValidation {
  const contentType = request.headers.get("content-type");
  if (!contentType) {
    return { ok: false, status: 400, error: "Missing content-type" };
  }
  if (!/^multipart\/form-data\b/i.test(contentType)) {
    return { ok: false, status: 415, error: "Expected multipart/form-data" };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > SPONSORSHIP_MULTIPART_MAX_BYTES) {
      return { ok: false, status: 413, error: "Sponsorship pledge upload is too large" };
    }
  }

  return { ok: true };
}

export async function parseSponsorshipMultipart(
  request: Request,
): Promise<ParsedSponsorshipMultipart> {
  const formData = await request.formData();
  const payloadValue = formData.get("payload");
  if (typeof payloadValue !== "string") {
    throw new SubmissionValidationError("Missing sponsorship pledge payload");
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(payloadValue);
  } catch (error) {
    throw new SyntaxError("Invalid sponsorship pledge payload JSON", { cause: error });
  }

  const parsed = sponsorshipPledgeSubmissionSchema.parse(rawPayload);
  const turnstileToken =
    isRecord(rawPayload) && typeof rawPayload.turnstileToken === "string"
      ? rawPayload.turnstileToken
      : undefined;

  const proofValue = formData.get("proof");
  const hasProofFile = isFile(proofValue);

  if (parsed.proofMetadata && !hasProofFile) {
    throw new SubmissionValidationError("Payment proof metadata was provided without a file");
  }
  if (!parsed.proofMetadata && hasProofFile) {
    throw new SubmissionValidationError("Payment proof file was provided without metadata");
  }

  let proof: ParsedSponsorshipProof | undefined;
  if (hasProofFile && parsed.proofMetadata) {
    const descriptor = validateProofDescriptor({
      fileName: proofValue.name,
      mimeType: proofValue.type,
      sizeBytes: proofValue.size,
    });
    proof = { ...descriptor, file: proofValue, metadata: parsed.proofMetadata };
  }

  return {
    payload: turnstileToken ? { ...parsed, turnstileToken } : parsed,
    proof,
  };
}

type PersistSponsorshipPledgeInput = {
  client: PublicSponsorshipSupabaseClient;
  parsed: ParsedSponsorshipMultipart;
  now?: () => Date;
  createStatusTokenPair?: typeof createStatusTokenPair;
  appUrl?: string;
  logger?: Pick<Console, "error">;
};

async function cleanupFailedPersistence(input: {
  client: PublicSponsorshipSupabaseClient;
  pledgeId: string | null;
  uploadedPaths: string[];
  logger: Pick<Console, "error">;
}) {
  if (input.uploadedPaths.length > 0) {
    try {
      const { error } = await input.client.storage
        .from(SPONSORSHIP_PROOF_BUCKET)
        .remove(input.uploadedPaths);
      if (error) input.logger.error("Failed to clean up sponsorship payment proof", error);
    } catch (error) {
      input.logger.error("Failed to clean up sponsorship payment proof", error);
    }
  }

  if (input.pledgeId) {
    try {
      const { error } = await input.client
        .from("public_status_token")
        .delete()
        .eq("entity_id", input.pledgeId)
        .eq("entity_type", "sponsorship_pledge");
      if (error) input.logger.error("Failed to clean up sponsorship status token", error);
    } catch (error) {
      input.logger.error("Failed to clean up sponsorship status token", error);
    }

    try {
      const { error } = await input.client
        .from("sponsorship_pledge")
        .delete()
        .eq("id", input.pledgeId);
      if (error) input.logger.error("Failed to clean up sponsorship pledge row", error);
    } catch (error) {
      input.logger.error("Failed to clean up sponsorship pledge row", error);
    }
  }
}

export async function persistSponsorshipPledge({
  client,
  parsed,
  now = () => new Date(),
  createStatusTokenPair: makeStatusToken = createStatusTokenPair,
  appUrl = getAppUrl(),
  logger = console,
}: PersistSponsorshipPledgeInput): Promise<SponsorshipPledgePersistResult> {
  let pledgeId: string | null = null;
  const uploadedPaths: string[] = [];

  try {
    const supporter = requireNoError(
      await client
        .from("supporter")
        .upsert(
          {
            name: parsed.payload.contact.supporterName,
            email: parsed.payload.contact.email,
            phone: parsed.payload.contact.phone,
            language: parsed.payload.language,
            source: "sponsorship_pledge_form",
          },
          { onConflict: "email" },
        )
        .select("id")
        .single(),
      "Failed to save sponsorship supporter",
    ) as { id: string } | null;
    if (!supporter?.id) throw new Error("Missing supporter id");
    const supporterId = supporter.id;

    const status: SponsorshipPledgeStatus = parsed.proof ? "provisional" : "pending_payment";

    const pledge = requireNoError(
      await client
        .from("sponsorship_pledge")
        .insert(toPledgeInsert(supporterId, status, parsed.payload))
        .select("id")
        .single(),
      "Failed to save sponsorship pledge",
    ) as { id: string } | null;
    if (!pledge?.id) throw new Error("Missing sponsorship pledge id");
    pledgeId = pledge.id;

    requireNoError(
      await client.from("sponsorship_preference").insert(toPreferenceInserts(pledgeId, parsed.payload)),
      "Failed to save sponsorship animal preferences",
    );

    if (parsed.proof) {
      const storagePath = `${pledgeId}/${safeFileName(parsed.proof.fileName)}`;
      const upload = await client.storage
        .from(SPONSORSHIP_PROOF_BUCKET)
        .upload(storagePath, parsed.proof.file, {
          contentType: parsed.proof.mimeType,
          upsert: false,
        });
      if (upload.error) throw upload.error;
      uploadedPaths.push(upload.data?.path ?? storagePath);

      requireNoError(
        await client
          .from("sponsorship_payment_proof")
          .insert(
            toPaymentProofInsert(
              pledgeId,
              upload.data?.path ?? storagePath,
              parsed.proof,
              parsed.proof.metadata,
            ),
          ),
        "Failed to save sponsorship payment proof",
      );
    }

    const reference = referenceForPledge(pledgeId);
    const token = makeStatusToken();
    const expiresAt = statusTokenExpiry(now);
    requireNoError(
      await client.from("public_status_token").insert({
        token_hash: token.tokenHash,
        entity_type: "sponsorship_pledge",
        entity_id: pledgeId,
        expires_at: expiresAt,
      }),
      "Failed to save sponsorship status token",
    );

    return {
      pledgeId,
      supporterId,
      reference,
      status,
      amountCents: toPledgeInsert(supporterId, status, parsed.payload).amount_cents,
      statusToken: token.rawToken,
      statusUrl: buildStatusUrl(appUrl, token.rawToken),
      expiresAt,
    };
  } catch (error) {
    await cleanupFailedPersistence({ client, pledgeId, uploadedPaths, logger });
    logger.error("Failed to save sponsorship pledge", error);
    throw new Error("Failed to save sponsorship pledge");
  }
}

export function isSubmissionValidationError(error: unknown) {
  return (
    error instanceof SubmissionValidationError ||
    error instanceof SyntaxError ||
    error instanceof ZodError
  );
}
