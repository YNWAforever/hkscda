import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import type { createSponsorshipAdminService } from "./service";

type SponsorshipAdminService = ReturnType<typeof createSponsorshipAdminService>;

type HandlerContext = {
  request: Request;
  params?: Record<string, string | undefined>;
};

type CreateSponsorshipAdminHandlersArgs = {
  requireCoordinator: (request: Request) => Promise<AdminUser>;
  service: SponsorshipAdminService;
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
}

function requiredUuid(params: HandlerContext["params"], key: string) {
  const value = params?.[key];
  if (!value || !z.string().uuid().safeParse(value).success) {
    throw jsonResponse({ error: `Invalid ${key}` }, { status: 400 });
  }
  return value;
}

const notFoundDomainErrors = new Set(["Sponsorship pledge not found"]);

const conflictDomainErrors = new Set([
  "Sponsorship pledge is not eligible for a recorded payment",
  "Sponsorship pledge is not awaiting review",
  "Sponsorship pledge has no proof pending review",
  "Sponsorship pledge is already cancelled",
]);

const badRequestDomainErrors = new Set(["A proof file is required to record a payment"]);

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

function domainError(error: Error) {
  if (notFoundDomainErrors.has(error.message)) {
    return jsonResponse({ error: error.message }, { status: 404 });
  }
  if (conflictDomainErrors.has(error.message)) {
    return jsonResponse({ error: error.message }, { status: 409 });
  }
  if (badRequestDomainErrors.has(error.message)) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }
  return null;
}

async function withErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return responseError(error);
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid sponsorship review request" }, { status: 400 });
    }
    if (error instanceof Error) {
      const response = domainError(error);
      if (response) return response;
    }

    console.error(error);
    return jsonResponse({ error: "Could not process sponsorship review request" }, { status: 500 });
  }
}

export function createSponsorshipAdminHandlers({
  requireCoordinator,
  service,
}: CreateSponsorshipAdminHandlersArgs) {
  return {
    listPledges({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = Object.fromEntries(new URL(request.url).searchParams);
        return jsonResponse(await service.listPledges(search));
      });
    },

    getPledge({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        await requireCoordinator(request);
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
        await requireCoordinator(request);
        const url = await service.getProofSigningInfo(pledgeId);
        if (!url) {
          return jsonResponse({ error: "Payment proof not found" }, { status: 404 });
        }
        return jsonResponse(url);
      });
    },

    recordPayment({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        const result = await service.recordPayment({
          actorUserId: admin.authUserId,
          pledgeId,
          input: await jsonBody(request),
        });
        return jsonResponse({ proof: result }, { status: 201 });
      });
    },

    reviewProof({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        await service.reviewProof({
          actorUserId: admin.authUserId,
          pledgeId,
          input: await jsonBody(request),
        });
        return jsonResponse({ ok: true });
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
  };
}
