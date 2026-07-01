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
  file: File;
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
  parsed: ParsedAdoptionMultipart;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNoError<T>(result: QueryResult<T>, message: string): T | null {
  if (result.error) throw result.error;
  return result.data ?? null;
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function safeFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || "photo";
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_");
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
        .from("adoption_applications")
        .delete()
        .eq("id", input.applicationId);
      if (error) input.logger.error("Failed to clean up adoption application row", error);
    } catch (error) {
      input.logger.error("Failed to clean up adoption application row", error);
    }
  }
}

export async function parseAdoptionMultipart(request: Request): Promise<ParsedAdoptionMultipart> {
  const formData = await request.formData();
  const payloadValue = formData.get("payload");
  if (typeof payloadValue !== "string") {
    throw new SubmissionValidationError("Missing adoption application payload");
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(payloadValue);
  } catch (error) {
    throw new SyntaxError("Invalid adoption application payload JSON", { cause: error });
  }

  const parsed = expandedAdoptionApplicationSchema.parse(rawPayload);
  const turnstileToken =
    isRecord(rawPayload) && typeof rawPayload.turnstileToken === "string"
      ? rawPayload.turnstileToken
      : undefined;

  const photos: ParsedAdoptionPhoto[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("photo:")) continue;
    if (!isFile(value)) continue;

    const descriptor = validatePhotoDescriptor({
      category: key.slice("photo:".length),
      fileName: value.name,
      mimeType: value.type,
      sizeBytes: value.size,
    });
    photos.push({ ...descriptor, file: value });
  }

  if (photos.length === 0) {
    throw new SubmissionValidationError("At least one adoption photo is required");
  }
  if (photos.length > MAX_ADOPTION_PHOTOS) {
    throw new SubmissionValidationError("No more than 6 adoption photos can be uploaded");
  }

  return {
    payload: turnstileToken ? { ...parsed, turnstileToken } : parsed,
    photos,
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
  let applicationId: string | null = null;
  const uploadedPaths: string[] = [];

  try {
    const summaryInsert = toAdoptionApplicationSummaryInsert(parsed.payload);
    const application = requireNoError(
      await client.from("adoption_applications").insert(summaryInsert).select("id").single(),
      "Failed to save adoption application",
    ) as { id: string } | null;
    if (!application?.id) throw new Error("Missing adoption application id");
    applicationId = application.id;

    const photoRows = [];
    for (const photo of parsed.photos) {
      const storagePath = `${applicationId}/${photo.category}/${safeFileName(photo.fileName)}`;
      const upload = await client.storage
        .from(ADOPTION_PHOTO_BUCKET)
        .upload(storagePath, photo.file, {
          contentType: photo.mimeType,
          upsert: false,
        });
      if (upload.error) throw upload.error;
      uploadedPaths.push(upload.data?.path ?? storagePath);
      photoRows.push({
        public_application_id: applicationId,
        storage_bucket: ADOPTION_PHOTO_BUCKET,
        storage_path: upload.data?.path ?? storagePath,
        file_name: photo.fileName,
        mime_type: photo.mimeType,
        size_bytes: photo.sizeBytes,
        photo_category: photo.category,
      });
    }

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

    const caseResult = await coordinatorService.createCaseFromPublicApplication({
      publicApplicationId: applicationId,
      input: {
        ...summaryInsert,
        preferences: coordinatorPreferences(parsed.payload),
      },
    });

    const reference = referenceForApplication(applicationId);
    requireNoError(
      await client.from("adoption_intake_item").insert({
        public_application_id: applicationId,
        adoption_case_id: caseResult.id,
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
      }),
      "Failed to save adoption intake item",
    );

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
    statusUrl: result.statusUrl,
    expiresAt: result.expiresAt,
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
