import type { SupabaseClient } from "@supabase/supabase-js";

import { hashStatusToken } from "./statusToken.server";

const ADOPTION_PHOTO_BUCKET = "adoption-application-photos";
const UPLOAD_INTENT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const CLEANUP_GRACE_MS = 60 * 60 * 1000;

export type AdoptionUploadIntent = {
  applicationId: string;
  photoPaths: string[];
  statusTokenHash: string;
  expiresAt: string;
  submittedAt: string | null;
};

type UploadIntentRow = {
  application_id: string;
  photo_paths: string[];
  status_token_hash: string;
  expires_at: string;
  submitted_at: string | null;
};

function toIntent(row: UploadIntentRow): AdoptionUploadIntent {
  return {
    applicationId: row.application_id,
    photoPaths: row.photo_paths,
    statusTokenHash: row.status_token_hash,
    expiresAt: row.expires_at,
    submittedAt: row.submitted_at,
  };
}

export function matchesAdoptionUploadIntent(
  intent: AdoptionUploadIntent,
  input: { applicationId: string; photoPaths: string[]; statusToken: string },
): boolean {
  if (intent.applicationId !== input.applicationId) return false;
  if (hashStatusToken(input.statusToken) !== intent.statusTokenHash) return false;
  if (intent.photoPaths.length !== input.photoPaths.length) return false;
  const expected = [...intent.photoPaths].sort();
  const actual = [...input.photoPaths].sort();
  return expected.every((path, index) => {
    return path.startsWith(`${input.applicationId}/`) && path === actual[index];
  });
}

export function validateAdoptionUploadIntent(
  intent: AdoptionUploadIntent,
  input: { applicationId: string; photoPaths: string[]; statusToken: string },
  now = new Date(),
): boolean {
  return (
    !intent.submittedAt &&
    Date.parse(intent.expiresAt) > now.getTime() &&
    matchesAdoptionUploadIntent(intent, input)
  );
}

export async function registerAdoptionUploadIntent(
  client: SupabaseClient,
  input: { applicationId: string; photoPaths: string[]; statusTokenHash: string },
  now = new Date(),
): Promise<AdoptionUploadIntent> {
  const expiresAt = new Date(now.getTime() + UPLOAD_INTENT_LIFETIME_MS).toISOString();
  const { error } = await client.from("adoption_upload_intent").insert({
    application_id: input.applicationId,
    photo_paths: input.photoPaths,
    status_token_hash: input.statusTokenHash,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return {
    ...input,
    expiresAt,
    submittedAt: null,
  };
}

export async function loadAdoptionUploadIntent(
  client: SupabaseClient,
  applicationId: string,
): Promise<AdoptionUploadIntent | null> {
  const { data, error } = await client
    .from("adoption_upload_intent")
    .select("application_id,photo_paths,status_token_hash,expires_at,submitted_at")
    .eq("application_id", applicationId)
    .maybeSingle<UploadIntentRow>();
  if (error) throw error;
  return data ? toIntent(data) : null;
}

export async function hasPersistedAdoptionApplication(
  client: SupabaseClient,
  applicationId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("adoption_applications")
    .select("id")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** A summary row is written before the rest of the journey, so it is not proof of completion. */
export async function hasCompletedAdoptionApplication(
  client: SupabaseClient,
  applicationId: string,
  statusToken: string,
  expectedFingerprint: string,
  now = new Date(),
): Promise<"new" | "recovered" | "conflict" | "forbidden" | "expired"> {
  const { data, error } = await client
    .from("adoption_case")
    .select("id")
    .eq("public_application_id", applicationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return "new";

  const { data: token, error: tokenError } = await client
    .from("public_status_token")
    .select("submission_fingerprint,expires_at,revoked_at")
    .eq("entity_type", "adoption_application")
    .eq("entity_id", applicationId)
    .eq("token_hash", hashStatusToken(statusToken))
    .maybeSingle<{
      submission_fingerprint: string | null;
      expires_at: string;
      revoked_at: string | null;
    }>();
  if (tokenError) throw tokenError;
  if (!token) return "forbidden";
  const expiresAt = Date.parse(token.expires_at);
  if (token.revoked_at || !Number.isFinite(expiresAt) || expiresAt <= now.getTime())
    return "expired";
  return token.submission_fingerprint === expectedFingerprint ? "recovered" : "conflict";
}
export async function markAdoptionUploadIntentSubmitted(
  client: SupabaseClient,
  applicationId: string,
): Promise<void> {
  const { error } = await client
    .from("adoption_upload_intent")
    .update({ submitted_at: new Date().toISOString() })
    .eq("application_id", applicationId)
    .is("submitted_at", null);
  if (error) throw error;
}

export type AdoptionUploadCleanupPort = {
  listExpired(): Promise<AdoptionUploadIntent[]>;
  hasApplication(applicationId: string): Promise<boolean>;
  removePhotos(paths: string[]): Promise<void>;
  deleteIntent(applicationId: string): Promise<void>;
  markSubmitted(applicationId: string): Promise<void>;
};

export async function cleanupExpiredAdoptionUploads(
  port: AdoptionUploadCleanupPort,
  logger: Pick<Console, "error"> = console,
): Promise<{ removed: number; preserved: number; failed: number }> {
  const summary = { removed: 0, preserved: 0, failed: 0 };
  for (const intent of await port.listExpired()) {
    try {
      if (await port.hasApplication(intent.applicationId)) {
        await port.markSubmitted(intent.applicationId);
        summary.preserved += 1;
        continue;
      }
      await port.removePhotos(intent.photoPaths);
      await port.deleteIntent(intent.applicationId);
      summary.removed += 1;
    } catch (error) {
      logger.error("Failed to clean up expired adoption upload intent", {
        applicationId: intent.applicationId,
        error,
      });
      summary.failed += 1;
    }
  }
  return summary;
}

export function createSupabaseAdoptionUploadCleanupPort(
  client: SupabaseClient,
  now = new Date(),
): AdoptionUploadCleanupPort {
  const cutoff = new Date(now.getTime() - CLEANUP_GRACE_MS).toISOString();
  return {
    async listExpired() {
      const { data, error } = await client
        .from("adoption_upload_intent")
        .select("application_id,photo_paths,status_token_hash,expires_at,submitted_at")
        .is("submitted_at", null)
        .lt("expires_at", cutoff)
        .order("expires_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as UploadIntentRow[]).map(toIntent);
    },
    hasApplication: (applicationId) => hasPersistedAdoptionApplication(client, applicationId),
    async removePhotos(paths) {
      if (paths.length === 0) return;
      const { error } = await client.storage.from(ADOPTION_PHOTO_BUCKET).remove(paths);
      if (error) throw error;
    },
    async deleteIntent(applicationId) {
      const { error } = await client
        .from("adoption_upload_intent")
        .delete()
        .eq("application_id", applicationId)
        .is("submitted_at", null);
      if (error) throw error;
    },
    markSubmitted: (applicationId) => markAdoptionUploadIntentSubmitted(client, applicationId),
  };
}
