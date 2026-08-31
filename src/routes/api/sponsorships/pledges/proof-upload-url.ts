import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { validateProofDescriptor } from "../../../../lib/sponsorship/schemas";
import { createSignedUploadUrls } from "../../../../lib/publicUploads/signedUpload.server";
import { createSupabaseServiceClient } from "../../../../lib/donations/supabase.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../../lib/security/rate-limit.server";

export const SPONSORSHIP_PROOF_BUCKET = "sponsorship-payment-proof";

const requestSchema = z.object({
  proof: z.object({
    fileName: z.unknown(),
    mimeType: z.unknown(),
    sizeBytes: z.unknown(),
  }),
});

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export const Route = createFileRoute("/api/sponsorships/pledges/proof-upload-url")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limit = await enforceRateLimit(ip, {
          prefix: "sponsorship-proof-upload-url",
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
          const descriptor = validateProofDescriptor({
            fileName: parsed.proof.fileName,
            mimeType: parsed.proof.mimeType,
            sizeBytes: parsed.proof.sizeBytes,
          });
          const pledgeId = crypto.randomUUID();
          const client = createSupabaseServiceClient();
          const [upload] = await createSignedUploadUrls(
            client,
            SPONSORSHIP_PROOF_BUCKET,
            pledgeId,
            [{ category: "proof", fileName: descriptor.fileName }],
          );

          return jsonNoStore({ pledgeId, upload }, { status: 201 });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return jsonNoStore({ error: "Invalid proof upload request" }, { status: 400 });
          }
          console.error(error);
          return jsonNoStore({ error: "Could not create upload URL" }, { status: 500 });
        }
      },
    },
  },
});
