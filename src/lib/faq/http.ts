import { z } from "zod";
import { readAdminJsonObject } from "../http/adminJson.server";
import { requiredReasonSchema } from "../admin/requiredReason";
import { RequestBodyTooLargeError } from "../http/publicJson.server";

import type { AdminUser } from "../donations/supabase.server";
import type { SearchGapReport } from "./searchGaps";
import type { createFaqService } from "./service";

type HandlerContext = { request: Request };
type FaqService = ReturnType<typeof createFaqService>;

type CreateAdminFaqHandlersArgs = {
  requireFaqAdmin: (request: Request) => Promise<AdminUser>;
  service: Pick<FaqService, "listAdmin" | "upsert" | "deactivate">;
};

type CreateAdminFaqSearchGapHandlerArgs = {
  requireFaqAdmin: (request: Request) => Promise<AdminUser>;
  service: { listReport(): Promise<SearchGapReport> };
};

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function jsonBody(request: Request) {
  try {
    return await readAdminJsonObject(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      throw jsonNoStore({ error: "Request body too large" }, { status: 413 });
    throw jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
  }
}

async function withFaqErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError)
      return jsonNoStore({ error: "Invalid FAQ request" }, { status: 400 });
    console.error(error);
    return jsonNoStore({ error: "Could not process FAQ request" }, { status: 500 });
  }
}

export function createAdminFaqHandlers({ requireFaqAdmin, service }: CreateAdminFaqHandlersArgs) {
  return {
    list({ request }: HandlerContext) {
      return withFaqErrors(async () => {
        await requireFaqAdmin(request);
        return jsonNoStore(await service.listAdmin());
      });
    },

    upsert({ request }: HandlerContext) {
      return withFaqErrors(async () => {
        const admin = await requireFaqAdmin(request);
        return jsonNoStore({
          entry: await service.upsert({
            actorUserId: admin.authUserId,
            input: await jsonBody(request),
          }),
        });
      });
    },

    deactivate({ request }: HandlerContext) {
      return withFaqErrors(async () => {
        const admin = await requireFaqAdmin(request);
        const body = (await jsonBody(request)) as { id?: string; reason?: unknown };
        if (!body.id) return jsonNoStore({ error: "Missing FAQ entry id" }, { status: 400 });
        const reason = requiredReasonSchema.safeParse(body.reason);
        if (!reason.success)
          return jsonNoStore(
            { error: "Deactivating a FAQ entry requires a reason of 1 to 500 characters" },
            { status: 400 },
          );
        await service.deactivate({
          actorUserId: admin.authUserId,
          id: body.id,
          reason: reason.data,
        });
        return jsonNoStore({ ok: true });
      });
    },
  };
}

/** GET handler for the staff-only report of recent zero-result search topics. */
export function createAdminFaqSearchGapHandler({
  requireFaqAdmin,
  service,
}: CreateAdminFaqSearchGapHandlerArgs) {
  return function listSearchGaps({ request }: HandlerContext) {
    return withFaqErrors(async () => {
      await requireFaqAdmin(request);
      return jsonNoStore(await service.listReport());
    });
  };
}
