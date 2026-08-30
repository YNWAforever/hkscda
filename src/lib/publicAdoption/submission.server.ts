import { ZodError } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createStatusTokenPair, statusTokenExpiry } from "./statusToken.server";
import { renderAdoptionConfirmationEmail } from "./emailTemplates.server";
import {
  type AdoptionPhotoDescriptor,
  type ExpandedAdoptionApplication,
  expandedAdoptionApplicationSchema,
  toAdoptionApplicationSummaryInsert,
  toDetailInsert,
  toPreferenceInserts,
  toVisitPreferenceInsert,
  validatePhotoDescriptor,
} from "./schemas";
import { getAppUrl, getEmailConfig } from "../donations/config.server";
import { verifyUploadedObjects } from "../publicUploads/signedUpload.server";

export const ADOPTION_PHOTO_BUCKET = "adoption-application-photos";
export const MAX_ADOPTION_PHOTOS = 6;

export class SubmissionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionValidationError";
  }
}

export type ParsedAdoptionPayload = ExpandedAdoptionApplication & {
  turnstileToken?: string;
};

export type ParsedAdoptionPhoto = AdoptionPhotoDescriptor & {
  storagePath: string;
};

export type ParsedAdoptionMultipart = {
  payload: ParsedAdoptionPayload;
  photos: ParsedAdoptionPhoto[];
};

export type PublicAdoptionPersistResult = {
  applicationId: string;
  caseId: string;
  reference: string;
  statusToken: string;
  statusUrl: string;
  expiresAt: string;
};

type QueryResult<T = unknown> = {
  data: T | null;
  error: unknown;
};

export type PublicAdoptionSupabaseClient = SupabaseClient;

type CoordinatorCaseService = {
  createCaseFromPublicApplication(args: {
    publicApplicationId: string;
    input: ReturnType<typeof toAdoptionApplicationSummaryInsert> & {
      preferences?: Record<string, unknown>;
    };
  }): Promise<{ id: string }>;
};

type PersistPublicAdoptionJourneyInput = {
  client: PublicAdoptionSupabaseClient;
  parsed: ParsedAdoptionMultipart & { applicationId: string };
  coordinatorService: CoordinatorCaseService;
  now?: () => Date;
  createStatusTokenPair?: typeof createStatusTokenPair;
  appUrl?: string;
  logger?: Pick<Console, "error">;
};

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

type SendAdoptionConfirmationEmailDeps = {
  getEmailConfig?: () => EmailConfig;
  createEmailSender?: (apiKey: string) => Promise<EmailSender> | EmailSender;
  logger?: Pick<Console, "error">;
};

export type AdoptionConfirmationEmailResult = "queued" | "sent" | "failed";

function requireNoError<T>(result: QueryResult<T>, message: string): T | null {
  if (result.error) throw result.error;
  return result.data ?? null;
}

function referenceForApplication(applicationId: string) {
  return `APP-${applicationId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function buildStatusUrl(appUrl: string, rawToken: string) {
  return `${appUrl.replace(/\/+$/, "")}/adoption/status/${encodeURIComponent(rawToken)}`;
}

function intakeDueAt(input: ExpandedAdoptionApplication) {
  return new Date(`${input.visit.dateRangeStart}T00:00:00.000Z`).toISOString();
}

function coordinatorPreferences(input: ExpandedAdoptionApplication) {
  return {
    language: input.language,
    rankedAnimals: input.animalPreferences,
    visit: input.visit,
  };
}

async function cleanupFailedPersistence(input: {
  client: PublicAdoptionSupabaseClient;
  applicationId: string | null;
  uploadedPaths: string[];
  logger: Pick<Console, "error">;
}) {
  if (input.uploadedPaths.length > 0) {
    try {
      const { error } = await input.client.storage
        .from(ADOPTION_PHOTO_BUCKET)
        .remove(input.uploadedPaths);
      if (error) input.logger.error("Failed to clean up adoption application photos", error);
    } catch (error) {
      input.logger.error("Failed to clean up adoption application photos", error);
    }
  }

  if (input.applicationId) {
    try {
      const { error } = await input.client
        .from("public_status_token")
        .delete()
        .eq("entity_id", input.applicationId)
        .eq("entity_type", "adoption_application");
      if (error) input.logger.error("Failed to clean up public status token", error);
    } catch (error) {
      input.logger.error("Failed to clean up public status token", error);
    }

    try {
      const { error } = await input.client
        .from("adoption_applications")
        .delete()
        .eq("id", input.applicationId);
      if (error) input.logger.error("Failed to clean up adoption application row", error);
    } catch (error) {
      input.logger.error("Failed to clean up adoption application row", error);
    }
  }
}

export type UploadedPhotoReference = {
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
};

export type AdoptionSubmissionRequestBody = {
  payload: unknown;
  applicationId: string;
  photos: UploadedPhotoReference[];
  turnstileToken?: string;
};

export function parseAdoptionSubmission(
  body: unknown,
): ParsedAdoptionMultipart & { applicationId: string } {
  if (typeof body !== "object" || body === null) {
    throw new SubmissionValidationError("Invalid adoption application request body");
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.applicationId !== "string" || !raw.applicationId) {
    throw new SubmissionValidationError("Missing adoption application id");
  }

  const parsed = expandedAdoptionApplicationSchema.parse(raw.payload);
  const turnstileToken = typeof raw.turnstileToken === "string" ? raw.turnstileToken : undefined;

  if (!Array.isArray(raw.photos) || raw.photos.length === 0) {
    throw new SubmissionValidationError("At least one adoption photo is required");
  }
  if (raw.photos.length > MAX_ADOPTION_PHOTOS) {
    throw new SubmissionValidationError("No more than 6 adoption photos can be uploaded");
  }

  const photos: ParsedAdoptionPhoto[] = raw.photos.map((entry) => {
    const descriptor = validatePhotoDescriptor(entry as never);
    const storagePath = (entry as { storagePath?: unknown }).storagePath;
    if (typeof storagePath !== "string" || !storagePath) {
      throw new SubmissionValidationError("Missing storage path for an adoption photo");
    }
    return { ...descriptor, storagePath };
  });

  return {
    payload: turnstileToken ? { ...parsed, turnstileToken } : parsed,
    photos,
    applicationId: raw.applicationId,
  };
}

export async function persistPublicAdoptionJourney({
  client,
  parsed,
  coordinatorService,
  now = () => new Date(),
  createStatusTokenPair: makeStatusToken = createStatusTokenPair,
  appUrl = getAppUrl(),
  logger = console,
}: PersistPublicAdoptionJourneyInput): Promise<PublicAdoptionPersistResult> {
  // Verify every referenced upload exists in Storage *before* touching the
  // database, and outside the try/catch below: that catch wraps every
  // subsequent failure into a generic "Failed to save adoption application"
  // Error for cleanup purposes, which would otherwise swallow this
  // SubmissionValidationError and prevent the route from mapping it to 400.
  const verification = await verifyUploadedObjects(
    client,
    ADOPTION_PHOTO_BUCKET,
    parsed.photos.map((photo) => ({
      category: photo.category,
      path: photo.storagePath,
      sizeBytes: photo.sizeBytes,
      mimeType: photo.mimeType,
    })),
  );
  if (!verification.ok) {
    logger.error("Adoption photo upload verification failed", {
      applicationId: parsed.applicationId,
      missing: verification.missing,
    });
    throw new SubmissionValidationError(
      `Uploaded photo not found: ${verification.missing.join(", ")}`,
    );
  }

  let applicationId: string | null = null;
  const uploadedPaths: string[] = [];

  try {
    const summaryInsert = {
      id: parsed.applicationId,
      ...toAdoptionApplicationSummaryInsert(parsed.payload),
    };
    requireNoError(
      await client.from("adoption_applications").insert(summaryInsert).select("id").single(),
      "Failed to save adoption application",
    );
    applicationId = parsed.applicationId;

    const photoRows = parsed.photos.map((photo) => ({
      public_application_id: applicationId,
      storage_bucket: ADOPTION_PHOTO_BUCKET,
      storage_path: photo.storagePath,
      file_name: photo.fileName,
      mime_type: photo.mimeType,
      size_bytes: photo.sizeBytes,
      photo_category: photo.category,
    }));

    requireNoError(
      await client.from("adoption_application_photo").insert(photoRows),
      "Failed to save adoption photo metadata",
    );
    requireNoError(
      await client
        .from("adoption_application_detail")
        .insert(toDetailInsert(applicationId, parsed.payload)),
      "Failed to save adoption application detail",
    );
    requireNoError(
      await client
        .from("adoption_application_animal_preference")
        .insert(toPreferenceInserts(applicationId, parsed.payload)),
      "Failed to save adoption animal preferences",
    );
    requireNoError(
      await client
        .from("adoption_application_visit_preference")
        .insert(toVisitPreferenceInsert(applicationId, parsed.payload)),
      "Failed to save adoption visit preferences",
    );

    const reference = referenceForApplication(applicationId);
    const token = makeStatusToken();
    const expiresAt = statusTokenExpiry(now);
    requireNoError(
      await client.from("public_status_token").insert({
        token_hash: token.tokenHash,
        entity_type: "adoption_application",
        entity_id: applicationId,
        expires_at: expiresAt,
      }),
      "Failed to save public status token",
    );

    const intakeItem = requireNoError(
      await client
        .from("adoption_intake_item")
        .insert({
          public_application_id: applicationId,
          adoption_case_id: null,
          lane: "new_adoption_application",
          urgency: "normal",
          summary: {
            reference,
            applicantName: parsed.payload.contact.applicantName,
            animalName: parsed.payload.animalPreferences[0]?.animalName ?? null,
            photoCount: parsed.photos.length,
            preferredContactMethod: parsed.payload.contact.preferredContactMethod,
          },
          due_at: intakeDueAt(parsed.payload),
        })
        .select("id")
        .single(),
      "Failed to save adoption intake item",
    ) as { id?: string } | null;

    const caseResult = await coordinatorService.createCaseFromPublicApplication({
      publicApplicationId: applicationId,
      input: {
        ...summaryInsert,
        preferences: coordinatorPreferences(parsed.payload),
      },
    });

    try {
      const linkQuery = client
        .from("adoption_intake_item")
        .update({ adoption_case_id: caseResult.id });
      const { error } = intakeItem?.id
        ? await linkQuery.eq("id", intakeItem.id)
        : await linkQuery.eq("public_application_id", applicationId);
      if (error) {
        logger.error("Failed to link adoption intake item to coordinator case", error);
      }
    } catch (error) {
      logger.error("Failed to link adoption intake item to coordinator case", error);
    }

    return {
      applicationId,
      caseId: caseResult.id,
      reference,
      statusToken: token.rawToken,
      statusUrl: buildStatusUrl(appUrl, token.rawToken),
      expiresAt,
    };
  } catch (error) {
    await cleanupFailedPersistence({ client, applicationId, uploadedPaths, logger });
    logger.error("Failed to save public adoption application", error);
    throw new Error("Failed to save adoption application");
  }
}

async function defaultCreateEmailSender(apiKey: string): Promise<EmailSender> {
  const { Resend } = await import("resend");
  return new Resend(apiKey).emails;
}

export async function sendAdoptionConfirmationEmail(
  client: PublicAdoptionSupabaseClient,
  payload: ParsedAdoptionPayload,
  result: PublicAdoptionPersistResult,
  {
    getEmailConfig: loadEmailConfig = getEmailConfig,
    createEmailSender = defaultCreateEmailSender,
    logger = console,
  }: SendAdoptionConfirmationEmailDeps = {},
): Promise<AdoptionConfirmationEmailResult> {
  const config = loadEmailConfig();
  const email = renderAdoptionConfirmationEmail({
    language: payload.language,
    applicantName: payload.contact.applicantName,
    reference: result.reference,
    statusUrl: result.statusUrl,
    expiresAt: result.expiresAt,
  });

  const { data: caseRow, error: caseError } = await client
    .from("adoption_case")
    .select("supporter_id")
    .eq("id", result.caseId)
    .maybeSingle();
  if (caseError) {
    logger.error("Failed to load adoption case supporter for confirmation email", caseError);
    return "failed";
  }

  const supporterId = (caseRow as { supporter_id?: string | null } | null)?.supporter_id ?? null;
  if (!supporterId) return "failed";

  const messagePayload = {
    kind: "adoption_confirmation",
    applicationId: result.applicationId,
    caseId: result.caseId,
    reference: result.reference,
    subject: email.subject,
    expiresAt: result.expiresAt,
    entityType: "adoption_application",
  };

  const { data: message, error: messageError } = await client
    .from("message")
    .insert({
      supporter_id: supporterId,
      channel: "email",
      status: "queued",
      payload: messagePayload,
    })
    .select("id")
    .single();
  if (messageError || !message) {
    logger.error("Failed to queue adoption confirmation email", messageError);
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
    logger.error("Failed to send adoption confirmation email", error);
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
