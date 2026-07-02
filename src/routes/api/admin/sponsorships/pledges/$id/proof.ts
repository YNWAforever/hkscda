import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { validateProofDescriptor } from "../../../../../../lib/sponsorship/schemas";
import { SPONSORSHIP_PROOF_BUCKET } from "../../../../../../lib/sponsorship/submission.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../../lib/donations/supabase.server";
import { createSupabaseSponsorshipAdminRepository } from "../../../../../../lib/sponsorshipAdmin/repository.server";
import { createSponsorshipAdminService } from "../../../../../../lib/sponsorshipAdmin/service";
import { sendPledgeStatusUpdateEmail } from "../../../../../../lib/sponsorshipAdmin/notifications.server";

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

async function recordPayment({ request, params }: { request: Request; params: { id: string } }) {
  try {
    const { id } = paramsSchema.parse(params);
    const client = createSupabaseServiceClient();
    const admin = await requireAdmin(request, ["staff", "admin"], client);

    const formData = await request.formData();
    const payloadValue = formData.get("payload");
    if (typeof payloadValue !== "string") {
      return jsonResponse({ error: "Missing payment payload" }, { status: 400 });
    }

    const payload = JSON.parse(payloadValue) as {
      paymentMethod: string;
      reference?: string | null;
      amountCents: number;
      paymentDate: string;
      note?: string | null;
    };

    const fileValue = formData.get("file");
    let file:
      | { storagePath: string; fileName: string; fileType: string; fileSize: number }
      | undefined;

    if (fileValue instanceof File) {
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
      file = {
        storagePath: upload.data?.path ?? storagePath,
        fileName: descriptor.fileName,
        fileType: descriptor.mimeType,
        fileSize: descriptor.sizeBytes,
      };
    }

    const repo = createSupabaseSponsorshipAdminRepository(client);
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail,
      client,
    });

    const result = await service.recordPayment({
      actorUserId: admin.authUserId,
      pledgeId: id,
      input: { ...payload, file },
    });

    return jsonResponse({ proof: result }, { status: 201 });
  } catch (error) {
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
