import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { validatePhotoDescriptor } from "../../../../lib/publicAdoption/schemas";
import { createStatusTokenPair } from "../../../../lib/publicAdoption/statusToken.server";
import { registerAdoptionUploadIntent } from "../../../../lib/publicAdoption/uploadIntent.server";
import { createSignedUploadUrls } from "../../../../lib/publicUploads/signedUpload.server";
import { createSupabaseServiceClient } from "../../../../lib/donations/supabase.server";
import type { RateLimitResult } from "../../../../lib/security/rate-limit.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../../lib/security/turnstile.server";

export const ADOPTION_PHOTO_BUCKET = "adoption-application-photos";
const MAX_PHOTOS_PER_REQUEST = 6;

const requestSchema = z.object({
  photos: z
    .array(
      z.object({
        category: z.unknown(),
        fileName: z.unknown(),
        mimeType: z.unknown(),
        sizeBytes: z.unknown(),
      }),
    )
    .min(1)
    .max(MAX_PHOTOS_PER_REQUEST),
  turnstileToken: z.string().optional(),
});

type Dependencies = {
  enforceRateLimit: (ip: string) => Promise<RateLimitResult>;
  verifyToken: (token: string | undefined, ip: string) => Promise<boolean>;
  createClient: typeof createSupabaseServiceClient;
  signUploads: typeof createSignedUploadUrls;
  registerIntent: typeof registerAdoptionUploadIntent;
  createTokenPair: typeof createStatusTokenPair;
  randomUUID: () => string;
};

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function createPhotoUploadUrlsHandler({
  enforceRateLimit: limit = (ip) =>
    enforceRateLimit(ip, { prefix: "adoption-photo-upload-urls", max: 10, window: "1 m" }),
  verifyToken = verifyTurnstile,
  createClient = createSupabaseServiceClient,
  signUploads = createSignedUploadUrls,
  registerIntent = registerAdoptionUploadIntent,
  createTokenPair = createStatusTokenPair,
  randomUUID = () => crypto.randomUUID(),
}: Partial<Dependencies> = {}) {
  return async (request: Request) => {
    const ip = getClientIp(request);
    const rateLimit = await limit(ip);
    if (!rateLimit.ok) {
      return jsonNoStore(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "retry-after": String(retryAfterSeconds(rateLimit)) } },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
    }

    try {
      const parsed = requestSchema.parse(body);
      const descriptors = parsed.photos.map((photo) =>
        validatePhotoDescriptor({
          category: photo.category,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          sizeBytes: photo.sizeBytes,
        }),
      );
      if (!(await verifyToken(parsed.turnstileToken, ip))) {
        return jsonNoStore({ error: "Verification failed" }, { status: 403 });
      }

      const applicationId = randomUUID();
      const statusToken = createTokenPair();
      const client = createClient();
      const uploads = await signUploads(client, ADOPTION_PHOTO_BUCKET, applicationId, descriptors);
      await registerIntent(client, {
        applicationId,
        photoPaths: uploads.map((upload) => upload.path),
        statusTokenHash: statusToken.tokenHash,
      });

      return jsonNoStore(
        { applicationId, uploads, statusToken: statusToken.rawToken },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return jsonNoStore({ error: "Invalid photo upload request" }, { status: 400 });
      }
      console.error(error);
      return jsonNoStore({ error: "Could not create upload URLs" }, { status: 500 });
    }
  };
}

export const Route = createFileRoute("/api/adoption/applications/photo-upload-urls")({
  server: {
    handlers: {
      POST: ({ request }) => createPhotoUploadUrlsHandler()(request),
    },
  },
});
