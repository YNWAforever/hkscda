import { createFileRoute } from "@tanstack/react-router";
import { RequestBodyTooLargeError, readPublicJson } from "../../../../lib/http/publicJson.server";
import { z } from "zod";

import { validateProofDescriptor } from "../../../../lib/sponsorship/schemas";
import {
  createProofUploadIntent,
  registerProofUploadIntent,
  PROOF_INTENT_LIFETIME_MS,
} from "../../../../lib/sponsorship/proofIntent.server";
import { createSignedUploadUrls } from "../../../../lib/publicUploads/signedUpload.server";
import { createSupabaseServiceClient } from "../../../../lib/donations/supabase.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
  type RateLimitResult,
} from "../../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../../lib/security/turnstile.server";

export const SPONSORSHIP_PROOF_BUCKET = "sponsorship-payment-proof";

const requestSchema = z.object({
  turnstileToken: z.string().optional(),
  proof: z.object({
    fileName: z.unknown(),
    mimeType: z.unknown(),
    sizeBytes: z.unknown(),
  }),
});

type Dependencies = {
  rateLimit(ip: string): Promise<RateLimitResult>;
  verify: typeof verifyTurnstile;
  createClient: typeof createSupabaseServiceClient;
  signUploads: typeof createSignedUploadUrls;
  issueIntent: typeof createProofUploadIntent;
  registerIntent: typeof registerProofUploadIntent;
  randomUUID(): string;
  now(): Date;
  logger: Pick<Console, "error">;
};

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function createProofUploadUrlHandler({
  rateLimit = (ip) =>
    enforceRateLimit(ip, { prefix: "sponsorship-proof-upload-url", max: 10, window: "1 m" }),
  verify = verifyTurnstile,
  createClient = createSupabaseServiceClient,
  signUploads = createSignedUploadUrls,
  issueIntent = createProofUploadIntent,
  registerIntent = registerProofUploadIntent,
  randomUUID = () => crypto.randomUUID(),
  now = () => new Date(),
  logger = console,
}: Partial<Dependencies> = {}) {
  return async (request: Request) => {
    const ip = getClientIp(request);
    const limit = await rateLimit(ip);
    if (!limit.ok) {
      return jsonNoStore(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
      );
    }

    let body: unknown;
    try {
      body = await readPublicJson(request);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError)
        return jsonNoStore({ error: "Request body too large" }, { status: 413 });
      return jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
    }

    try {
      const parsed = requestSchema.parse(body);
      const descriptor = validateProofDescriptor({
        fileName: parsed.proof.fileName,
        mimeType: parsed.proof.mimeType,
        sizeBytes: parsed.proof.sizeBytes,
      });
      if (!(await verify(parsed.turnstileToken, ip))) {
        return jsonNoStore({ error: "Verification failed" }, { status: 403 });
      }

      const pledgeId = randomUUID();
      const client = createClient();
      const [upload] = await signUploads(client, SPONSORSHIP_PROOF_BUCKET, pledgeId, [
        { category: "proof", fileName: descriptor.fileName },
      ]);
      const issuedAt = now();
      const proofIntent = issueIntent({ pledgeId, path: upload.path }, { now: issuedAt });
      await registerIntent(client, {
        pledgeId,
        storagePath: upload.path,
        expiresAt: new Date(issuedAt.getTime() + PROOF_INTENT_LIFETIME_MS).toISOString(),
      });
      return jsonNoStore({ pledgeId, upload, proofIntent }, { status: 201 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return jsonNoStore({ error: "Invalid proof upload request" }, { status: 400 });
      }
      logger.error(error);
      return jsonNoStore({ error: "Could not create upload URL" }, { status: 500 });
    }
  };
}

export const Route = createFileRoute("/api/sponsorships/pledges/proof-upload-url")({
  server: { handlers: { POST: ({ request }) => createProofUploadUrlHandler()(request) } },
});
