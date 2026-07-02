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
  return `SP-${pledgeId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
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

export function isSubmissionValidationError(error: unknown) {
  return (
    error instanceof SubmissionValidationError ||
    error instanceof SyntaxError ||
    error instanceof ZodError
  );
}
