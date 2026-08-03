import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import { notifyGroupEnquiryAdmins } from "../../../lib/groupEnquiries/notifications.server";
import { createSupabaseGroupEnquiryRepository } from "../../../lib/groupEnquiries/repository.server";
import { createGroupEnquiryService } from "../../../lib/groupEnquiries/service";
import type { RateLimitResult } from "../../../lib/security/rate-limit.server";
import { enforceRateLimit, getClientIp, retryAfterSeconds } from "../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../lib/security/turnstile.server";

type HandlerContext = { request: Request };
type SubmitService = { submitPublicEnquiry(input: unknown): Promise<{ ok: boolean; enquiryId: string }> };

type CreateGroupEnquiryRouteHandlerArgs = SubmitService & {
  verifyTurnstileToken?: (token: string | undefined, ip: string, request: Request) => Promise<boolean>;
  enforceRateLimitForRequest?: (request: Request) => Promise<RateLimitResult>;
};

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
  }
}

async function withGroupEnquiryErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return jsonNoStore({ error: "Invalid group enquiry request" }, { status: 400 });
    console.error(error);
    return jsonNoStore({ error: "Group enquiry could not be processed" }, { status: 500 });
  }
}

export function createGroupEnquiryRouteHandler({
  submitPublicEnquiry,
  verifyTurnstileToken = async (token, ip) => verifyTurnstile(token, ip),
  enforceRateLimitForRequest = async (request) =>
    enforceRateLimit(getClientIp(request), { prefix: "volunteer-group", max: 5, window: "1 m" }),
}: CreateGroupEnquiryRouteHandlerArgs) {
  return async ({ request }: HandlerContext) => {
    if (request.method !== "POST") {
      return jsonNoStore({ error: "Method not allowed" }, { status: 405 });
    }

    return withGroupEnquiryErrors(async () => {
      const rateLimit = await enforceRateLimitForRequest(request);
      if (!rateLimit.ok) {
        return jsonNoStore(
          { error: "Too many requests. Please try again shortly." },
          { status: 429, headers: { "retry-after": String(retryAfterSeconds(rateLimit)) } },
        );
      }

      const body = await jsonBody(request);
      const raw = body as Record<string, unknown>;
      const ip = getClientIp(request);
      const token = typeof raw.turnstileToken === "string" ? raw.turnstileToken : undefined;
      if (!(await verifyTurnstileToken(token, ip, request))) {
        return jsonNoStore({ error: "Verification failed" }, { status: 403 });
      }

      await submitPublicEnquiry(body);
      return jsonNoStore({ ok: true }, { status: 202 });
    });
  };
}

function createLiveHandler() {
  const client = createSupabaseServiceClient();
  const service = createGroupEnquiryService({
    repo: createSupabaseGroupEnquiryRepository(client),
    notifyAdmins: notifyGroupEnquiryAdmins,
  });
  return createGroupEnquiryRouteHandler(service);
}

export const Route = createFileRoute("/api/volunteer/group-enquiries")({
  server: {
    handlers: {
      GET: async (context) => createLiveHandler()(context),
      POST: async (context) => createLiveHandler()(context),
    },
  },
});
