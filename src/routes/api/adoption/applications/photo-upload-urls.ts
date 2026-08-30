import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { validatePhotoDescriptor } from "../../../../lib/publicAdoption/schemas";
import { createSignedUploadUrls } from "../../../../lib/publicUploads/signedUpload.server";
import { createSupabaseServiceClient } from "../../../../lib/donations/supabase.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../../lib/security/turnstile.server";

export const ADOPTION_PHOTO_BUCKET = "adoption-application-photos";
const MAX_PHOTOS_PER_REQUEST = 6;

const requestSchema = z.object({
  turnstileToken: z.string().optional(),
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
});

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export const Route = createFileRoute("/api/adoption/applications/photo-upload-urls")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limit = await enforceRateLimit(ip, {
          prefix: "adoption-photo-upload-urls",
          max: 10,
          window: "1 m",
        });
        if (!limit.ok) {
          return jsonNoStore(
            { error: "Too many requests. Please try again shortly." },
            { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
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
          if (!(await verifyTurnstile(parsed.turnstileToken, ip))) {
            return jsonNoStore({ error: "Verification failed" }, { status: 403 });
          }

          const descriptors = parsed.photos.map((photo) =>
            validatePhotoDescriptor({
              category: photo.category,
              fileName: photo.fileName,
              mimeType: photo.mimeType,
              sizeBytes: photo.sizeBytes,
            }),
          );
          const applicationId = crypto.randomUUID();
          const client = createSupabaseServiceClient();
          const uploads = await createSignedUploadUrls(
            client,
            ADOPTION_PHOTO_BUCKET,
            applicationId,
            descriptors,
          );

          return jsonNoStore({ applicationId, uploads }, { status: 201 });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return jsonNoStore({ error: "Invalid photo upload request" }, { status: 400 });
          }
          console.error(error);
          return jsonNoStore({ error: "Could not create upload URLs" }, { status: 500 });
        }
      },
    },
  },
});
