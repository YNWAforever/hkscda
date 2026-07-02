import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { validateProofDescriptor } from "../../../../../../lib/sponsorship/schemas";
import { SPONSORSHIP_PROOF_BUCKET } from "../../../../../../lib/sponsorship/submission.server";
import { createHandlersWithContext } from "../-handlers";

const paramsSchema = z.object({ id: z.string().uuid() });

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function safeFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || "proof";
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function responseError(error: Response) {
  const status = error.status;
  const contentType = error.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = await error.clone().json();
      if (body && typeof body === "object") return jsonResponse(body, { status });
    } catch {
      // Fall through to text/status normalization.
    }
  }

  let message = "";
  try {
    message = (await error.clone().text()).trim();
  } catch {
    message = "";
  }

  return jsonResponse({ error: message || error.statusText || "Request failed" }, { status });
}

const conflictDomainErrors = new Set(["Sponsorship pledge is not eligible for a recorded payment"]);

const notFoundDomainErrors = new Set(["Sponsorship pledge not found"]);

/**
 * Parses the multipart body, uploads the proof file (if provided) to
 * storage, and delegates persistence/notification to the already-tested
 * `service.recordPayment`. Eligibility is checked *before* the upload (via
 * `assertRecordPaymentEligible`) so a pledge that is not eligible for a
 * recorded payment never leaves an orphaned file in the bucket. If the
 * upload succeeds but the subsequent `recordPayment` call still fails, the
 * uploaded file is removed so nothing is left behind.
 */
async function recordPayment({ request, params }: { request: Request; params: { id: string } }) {
  let uploadedStoragePath: string | undefined;
  let client: ReturnType<typeof createHandlersWithContext>["client"] | undefined;

  try {
    const context = createHandlersWithContext();
    client = context.client;
    const { service, requireCoordinator } = context;

    const { id } = paramsSchema.parse(params);
    const admin = await requireCoordinator(request);

    const formData = await request.formData();
    const payloadValue = formData.get("payload");
    if (typeof payloadValue !== "string") {
      return jsonResponse({ error: "Missing payment payload" }, { status: 400 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadValue);
    } catch {
      return jsonResponse({ error: "Invalid payment payload" }, { status: 400 });
    }

    const fileValue = formData.get("file");
    let file:
      | { storagePath: string; fileName: string; fileType: string; fileSize: number }
      | undefined;

    if (fileValue instanceof File) {
      // Validate eligibility before touching storage so a rejected
      // (ineligible-status) request never leaves an orphaned file behind.
      await service.assertRecordPaymentEligible(id);

      const descriptor = validateProofDescriptor({
        fileName: fileValue.name,
        mimeType: fileValue.type,
        sizeBytes: fileValue.size,
      });
      const storagePath = `${id}/staff-${Date.now()}-${safeFileName(descriptor.fileName)}`;
      const upload = await client.storage
        .from(SPONSORSHIP_PROOF_BUCKET)
        .upload(storagePath, fileValue, { contentType: descriptor.mimeType, upsert: false });
      if (upload.error) throw upload.error;

      uploadedStoragePath = upload.data?.path ?? storagePath;
      file = {
        storagePath: uploadedStoragePath,
        fileName: descriptor.fileName,
        fileType: descriptor.mimeType,
        fileSize: descriptor.sizeBytes,
      };
    }

    const result = await service.recordPayment({
      actorUserId: admin.authUserId,
      pledgeId: id,
      input: { ...payload, file },
    });

    return jsonResponse({ proof: result }, { status: 201 });
  } catch (error) {
    if (uploadedStoragePath && client) {
      await client.storage.from(SPONSORSHIP_PROOF_BUCKET).remove([uploadedStoragePath]);
    }

    if (error instanceof Response) return responseError(error);
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid payment proof request" }, { status: 400 });
    }
    if (error instanceof Error) {
      if (notFoundDomainErrors.has(error.message)) {
        return jsonResponse({ error: error.message }, { status: 404 });
      }
      if (conflictDomainErrors.has(error.message)) {
        return jsonResponse({ error: error.message }, { status: 409 });
      }
    }

    console.error(error);
    return jsonResponse({ error: "Could not record sponsorship payment" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/proof")({
  server: {
    handlers: {
      POST: ({ request, params }) => recordPayment({ request, params }),
    },
  },
});
