import { z } from "zod";
import { readAdminJson } from "../http/adminJson.server";

import type { AdminUser } from "../donations/supabase.server";
import { InvalidRequestJsonError, RequestBodyTooLargeError } from "../http/publicJson.server";
import type { createSponsorshipAdminService } from "./service";

type SponsorshipAdminService = ReturnType<typeof createSponsorshipAdminService>;

type HandlerContext = {
  request: Request;
  params?: Record<string, string | undefined>;
};

type CreateSponsorshipAdminHandlersArgs = {
  requireReader: (request: Request) => Promise<AdminUser>;
  requireFinance: (request: Request) => Promise<AdminUser>;
  requireCoordinator: (request: Request) => Promise<AdminUser>;
  service: SponsorshipAdminService;
};

export function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function jsonBody(request: Request) {
  try {
    return await readAdminJson(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      throw jsonResponse({ error: "Request body too large" }, { status: 413 });
    throw jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
}

export function requiredUuid(params: HandlerContext["params"], key: string) {
  const value = params?.[key];
  if (!value || !z.string().uuid().safeParse(value).success) {
    throw jsonResponse({ error: `Invalid ${key}` }, { status: 400 });
  }
  return value;
}

const notFoundDomainErrors = new Set([
  "Sponsorship pledge not found",
  "Sponsorship assignment not found",
  "Animal not found",
]);

const conflictDomainErrors = new Set([
  "Sponsorship pledge is not eligible for a recorded payment",
  "Sponsorship pledge is not awaiting review",
  "Sponsorship pledge has no proof pending review",
  "Sponsorship pledge is already cancelled",
  "Sponsorship assignment is already ended",
]);

// The database raises "Actor <uuid> is not an active staff/admin user", so an
// exact-match set could never fire. Matched on the stable prefix instead.
function isForbiddenDomainError(message: string) {
  return message.startsWith("Actor ") && message.includes("is not an active staff/admin user");
}

// "Animal <uuid> cannot be sponsored" interpolates an id, so it cannot live in
// an exact-match set. This fires when the animal was adopted, died or left the
// programme between staff loading the page and confirming -- a race that
// resolves itself on retry, so it is a conflict, not a server fault.
function isAnimalConflictError(message: string) {
  return message.startsWith("Animal ") && message.endsWith("cannot be sponsored");
}

export async function responseError(error: Response) {
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

export function domainError(error: Error) {
  if (notFoundDomainErrors.has(error.message)) {
    return jsonResponse({ error: error.message }, { status: 404 });
  }
  if (conflictDomainErrors.has(error.message) || isAnimalConflictError(error.message)) {
    return jsonResponse({ error: error.message }, { status: 409 });
  }
  if (isForbiddenDomainError(error.message)) {
    return jsonResponse({ error: error.message }, { status: 403 });
  }
  return null;
}

export async function withErrors(
  operation: () => Promise<Response>,
  fallbackMessage = "Could not process sponsorship review request",
) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return responseError(error);
    if (error instanceof RequestBodyTooLargeError)
      return jsonResponse({ error: "Request body too large" }, { status: 413 });
    if (error instanceof InvalidRequestJsonError)
      return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid sponsorship review request" }, { status: 400 });
    }
    if (error instanceof Error) {
      const response = domainError(error);
      if (response) return response;
    }

    console.error(error);
    return jsonResponse({ error: fallbackMessage }, { status: 500 });
  }
}

export function createSponsorshipAdminHandlers({
  requireReader,
  requireFinance,
  requireCoordinator,
  service,
}: CreateSponsorshipAdminHandlersArgs) {
  return {
    listPledges({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireReader(request);
        const search = Object.fromEntries(new URL(request.url).searchParams);
        return jsonResponse(await service.listPledges(search));
      });
    },

    getPledge({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        await requireReader(request);
        const pledge = await service.getPledgeDetail(pledgeId);
        if (!pledge) {
          return jsonResponse({ error: "Sponsorship pledge not found" }, { status: 404 });
        }
        return jsonResponse({ pledge });
      });
    },

    getProofUrl({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        await requireReader(request);
        const search = new URL(request.url).searchParams;
        const proofId = z.string().uuid().parse(search.get("proofId"));
        const expectedRevision = z.coerce
          .number()
          .int()
          .positive()
          .parse(search.get("expectedRevision"));
        const url = await service.getProofSigningInfo(pledgeId, proofId, expectedRevision);
        if (!url) {
          return jsonResponse({ error: "Payment proof not found" }, { status: 404 });
        }
        return jsonResponse(url);
      });
    },

    reviewProof({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        const admin = await requireFinance(request);
        const result = await service.reviewProof({
          actorUserId: admin.authUserId,
          actorRole: admin.role,
          pledgeId,
          input: await jsonBody(request),
        });
        return jsonResponse(result);
      });
    },

    cancelPledge({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        await service.cancelPledge({
          actorUserId: admin.authUserId,
          pledgeId,
          input: await jsonBody(request),
        });
        return jsonResponse({ ok: true });
      });
    },

    assignAnimal({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        const result = await service.assignAnimal({
          actorUserId: admin.authUserId,
          pledgeId,
          input: await jsonBody(request),
        });
        return jsonResponse(result, { status: 201 });
      });
    },

    endAssignment({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        const assignmentId = requiredUuid(params, "assignmentId");
        const admin = await requireCoordinator(request);
        await service.endAssignment({
          actorUserId: admin.authUserId,
          pledgeId,
          assignmentId,
          input: await jsonBody(request),
        });
        return jsonResponse({ ok: true });
      });
    },
  };
}
