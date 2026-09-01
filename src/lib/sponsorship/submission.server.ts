import { ZodError } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createStatusTokenPair, statusTokenExpiry } from "../publicAdoption/statusToken.server";
import { renderPledgeConfirmationEmail } from "./emailTemplates.server";
import {
  type SponsorshipPaymentProofMetadata,
  type SponsorshipPledgeStatus,
  type SponsorshipPledgeSubmission,
  type SponsorshipProofDescriptor,
  sponsorshipPledgeSubmissionSchema,
  toPaymentProofInsert,
  toPledgeInsert,
  toPreferenceInserts,
  validateProofDescriptor,
} from "./schemas";
import { pledgeReference } from "./statusSummary";
import { buildConsentRows } from "../donations/domain";
import { getAppUrl } from "../appUrl.server";
import { getEmailConfig } from "../donations/config.server";
import { verifyUploadedObjects } from "../publicUploads/signedUpload.server";

export const SPONSORSHIP_PROOF_BUCKET = "sponsorship-payment-proof";

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
  storagePath: string;
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

function requireNoError<T>(result: QueryResult<T>, message: string): T | null {
  if (result.error) throw result.error;
  return result.data ?? null;
}

function buildStatusUrl(appUrl: string, rawToken: string) {
  return `${appUrl.replace(/\/+$/, "")}/sponsors/status/${encodeURIComponent(rawToken)}`;
}

export type UploadedProofReference = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
};

export type SponsorshipSubmissionRequestBody = {
  payload: unknown;
  pledgeId: string;
  proof?: UploadedProofReference;
  turnstileToken?: string;
};

export function parseSponsorshipSubmission(
  body: unknown,
): ParsedSponsorshipMultipart & { pledgeId: string } {
  if (typeof body !== "object" || body === null) {
    throw new SubmissionValidationError("Invalid sponsorship pledge request body");
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.pledgeId !== "string" || !raw.pledgeId) {
    throw new SubmissionValidationError("Missing sponsorship pledge id");
  }

  const parsed = sponsorshipPledgeSubmissionSchema.parse(raw.payload);
  const turnstileToken = typeof raw.turnstileToken === "string" ? raw.turnstileToken : undefined;

  const rawProof = raw.proof;
  if (parsed.proofMetadata && !rawProof) {
    throw new SubmissionValidationError(
      "Payment proof metadata was provided without a file reference",
    );
  }
  if (!parsed.proofMetadata && rawProof) {
    throw new SubmissionValidationError(
      "Payment proof file reference was provided without metadata",
    );
  }

  let proof: ParsedSponsorshipProof | undefined;
  if (rawProof && parsed.proofMetadata) {
    const entry = rawProof as Record<string, unknown>;
    const descriptor = validateProofDescriptor({
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      sizeBytes: entry.sizeBytes,
    });
    if (typeof entry.storagePath !== "string" || !entry.storagePath) {
      throw new SubmissionValidationError("Missing storage path for the payment proof");
    }
    proof = { ...descriptor, storagePath: entry.storagePath, metadata: parsed.proofMetadata };
  }

  return {
    payload: turnstileToken ? { ...parsed, turnstileToken } : parsed,
    proof,
    pledgeId: raw.pledgeId,
  };
}

type PersistSponsorshipPledgeInput = {
  client: PublicSponsorshipSupabaseClient;
  parsed: ParsedSponsorshipMultipart & { pledgeId: string };
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
  // Payment proof is optional for a sponsorship pledge -- a pledge with no
  // proof needs no verification at all. But when a proof reference *is*
  // given, verify it exists in Storage *before* touching the database, and
  // outside the try/catch below: that catch wraps every subsequent failure
  // into a generic "Failed to save sponsorship pledge" Error for cleanup
  // purposes, which would otherwise swallow this SubmissionValidationError
  // and prevent the route from mapping it to 400. Gating pledge creation
  // itself (not just the payment_proof row) on this check also avoids ever
  // creating a "provisional" pledge whose provisional status implies proof
  // was received when it in fact was not.
  if (parsed.proof) {
    const verification = await verifyUploadedObjects(client, SPONSORSHIP_PROOF_BUCKET, [
      {
        category: "proof",
        path: parsed.proof.storagePath,
        sizeBytes: parsed.proof.sizeBytes,
        mimeType: parsed.proof.mimeType,
      },
    ]);
    if (!verification.ok) {
      logger.error("Sponsorship payment proof upload verification failed", {
        pledgeId: parsed.pledgeId,
        missing: verification.missing,
      });
      throw new SubmissionValidationError(
        `Uploaded payment proof not found: ${verification.missing.join(", ")}`,
      );
    }
  }

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

    requireNoError(
      await client.from("consent").insert(
        buildConsentRows({
          supporterId,
          source: "sponsorship_pledge_form",
          timestamp: now().toISOString(),
          consents: parsed.payload.consents,
        }),
      ),
      "Failed to save sponsorship consent",
    );

    const status: SponsorshipPledgeStatus = parsed.proof ? "provisional" : "pending_payment";

    requireNoError(
      await client
        .from("sponsorship_pledge")
        .insert({ id: parsed.pledgeId, ...toPledgeInsert(supporterId, status, parsed.payload) })
        .select("id")
        .single(),
      "Failed to save sponsorship pledge",
    );
    pledgeId = parsed.pledgeId;

    requireNoError(
      await client
        .from("sponsorship_preference")
        .insert(toPreferenceInserts(pledgeId, parsed.payload)),
      "Failed to save sponsorship animal preferences",
    );

    if (parsed.proof) {
      requireNoError(
        await client
          .from("sponsorship_payment_proof")
          .insert(
            toPaymentProofInsert(
              pledgeId,
              parsed.proof.storagePath,
              parsed.proof,
              parsed.proof.metadata,
            ),
          ),
        "Failed to save sponsorship payment proof",
      );
    }

    const reference = pledgeReference(pledgeId);
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

type EmailConfig = ReturnType<typeof getEmailConfig>;

type EmailSender = {
  send(payload: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
};

type SendPledgeConfirmationEmailDeps = {
  getEmailConfig?: () => EmailConfig;
  createEmailSender?: (apiKey: string) => Promise<EmailSender> | EmailSender;
  logger?: Pick<Console, "error">;
};

export type SponsorshipConfirmationEmailResult = "queued" | "sent" | "failed";

async function defaultCreateEmailSender(apiKey: string): Promise<EmailSender> {
  const { Resend } = await import("resend");
  return new Resend(apiKey).emails;
}

export async function sendPledgeConfirmationEmail(
  client: PublicSponsorshipSupabaseClient,
  payload: ParsedSponsorshipPayload,
  result: SponsorshipPledgePersistResult,
  {
    getEmailConfig: loadEmailConfig = getEmailConfig,
    createEmailSender = defaultCreateEmailSender,
    logger = console,
  }: SendPledgeConfirmationEmailDeps = {},
): Promise<SponsorshipConfirmationEmailResult> {
  const config = loadEmailConfig();
  const email = renderPledgeConfirmationEmail({
    language: payload.language,
    supporterName: payload.contact.supporterName,
    reference: result.reference,
    amountCents: result.amountCents,
    status: result.status === "provisional" ? "provisional" : "pending_payment",
    statusUrl: result.statusUrl,
  });

  const messagePayload = {
    kind: "sponsorship_pledge_confirmation",
    pledgeId: result.pledgeId,
    reference: result.reference,
    subject: email.subject,
    entityType: "sponsorship_pledge",
  };

  const { data: message, error: messageError } = await client
    .from("message")
    .insert({
      supporter_id: result.supporterId,
      channel: "email",
      status: "queued",
      payload: messagePayload,
    })
    .select("id")
    .single();
  if (messageError || !message) {
    logger.error("Failed to queue sponsorship pledge confirmation email", messageError);
    return "failed";
  }

  const messageId = (message as { id: string }).id;
  if (!config.resendApiKey) return "queued";

  try {
    const emails = await createEmailSender(config.resendApiKey);
    await emails.send({
      from: config.from,
      to: payload.contact.email,
      replyTo: config.replyTo,
      subject: email.subject,
      html: email.html,
    });
  } catch (error) {
    logger.error("Failed to send sponsorship pledge confirmation email", error);
    await client.from("message").update({ status: "failed" }).eq("id", messageId);
    return "failed";
  }

  await client
    .from("message")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", messageId);
  return "sent";
}

export function isSubmissionValidationError(error: unknown) {
  return (
    error instanceof SubmissionValidationError ||
    error instanceof SyntaxError ||
    error instanceof ZodError
  );
}
