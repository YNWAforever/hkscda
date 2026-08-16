import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { AdminUser } from "../../../../lib/donations/supabase.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";
import { notifyGroupEnquiryAdmins } from "../../../../lib/groupEnquiries/notifications.server";
import { createSupabaseGroupEnquiryRepository } from "../../../../lib/groupEnquiries/repository.server";
import { createGroupEnquiryService } from "../../../../lib/groupEnquiries/service";

type HandlerContext = { request: Request };
type AdminGroupEnquiryService = ReturnType<typeof createGroupEnquiryService>;

type CreateAdminGroupEnquiryHandlersArgs = {
  requireVolunteerAdmin: (request: Request) => Promise<AdminUser>;
  service: Pick<
    AdminGroupEnquiryService,
    | "listGroupEnquiries"
    | "getGroupEnquiry"
    | "updateGroupEnquiry"
    | "retryGroupEnquiryNotification"
  >;
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

function searchParams(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams);
}

const notFoundDomainErrors = new Set(["Group enquiry not found"]);

async function withAdminGroupEnquiryErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError)
      return jsonNoStore({ error: "Invalid group enquiry admin request" }, { status: 400 });
    // A stale link is a client-side fact, not a server fault. Falling through to
    // 500 here left the admin UI unable to tell "gone" from "broken" and wrote a
    // spurious error into the production stream on every dead id. Peer domains
    // map this to 404 — lib/adoptions/http/shared.server.ts, lib/volunteers/http.server.ts.
    if (error instanceof Error && notFoundDomainErrors.has(error.message))
      return jsonNoStore({ error: error.message }, { status: 404 });
    console.error(error);
    return jsonNoStore({ error: "Could not process group enquiry admin request" }, { status: 500 });
  }
}

export function createAdminGroupEnquiryHandlers({
  requireVolunteerAdmin,
  service,
}: CreateAdminGroupEnquiryHandlersArgs) {
  return {
    listOrGet({ request }: HandlerContext) {
      return withAdminGroupEnquiryErrors(async () => {
        await requireVolunteerAdmin(request);
        const params = searchParams(request);
        if (typeof params.id === "string" && params.id) {
          return jsonNoStore(await service.getGroupEnquiry(params.id));
        }
        return jsonNoStore(await service.listGroupEnquiries(params));
      });
    },

    update({ request }: HandlerContext) {
      return withAdminGroupEnquiryErrors(async () => {
        // The resolved admin has to reach the service: this route mutates
        // group_enquiries over the service-role connection, where auth.uid() is
        // null, so nothing else can attribute the change.
        const admin = await requireVolunteerAdmin(request);
        const body = (await jsonBody(request)) as { id?: string; action?: string };
        if (!body.id) return jsonNoStore({ error: "Missing group enquiry id" }, { status: 400 });
        if (body.action === "retryNotification") {
          return jsonNoStore(
            await service.retryGroupEnquiryNotification({
              id: body.id,
              actorUserId: admin.authUserId,
            }),
          );
        }
        return jsonNoStore(
          await service.updateGroupEnquiry({
            id: body.id,
            input: body,
            actorUserId: admin.authUserId,
          }),
        );
      });
    },
  };
}

function createHandlers() {
  const client = createSupabaseServiceClient();
  const service = createGroupEnquiryService({
    repo: createSupabaseGroupEnquiryRepository(client),
    notifyAdmins: notifyGroupEnquiryAdmins,
  });
  return createAdminGroupEnquiryHandlers({
    requireVolunteerAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service,
  });
}

export const Route = createFileRoute("/api/admin/volunteers/group-enquiries")({
  server: {
    handlers: {
      GET: async (context) => createHandlers().listOrGet(context),
      PATCH: async (context) => createHandlers().update(context),
    },
  },
});
