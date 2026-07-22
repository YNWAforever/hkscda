import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { AdminUser } from "../../../../lib/donations/supabase.server";
import { createSupabaseServiceClient, requireAdmin } from "../../../../lib/donations/supabase.server";
import { notifyGroupEnquiryAdmins } from "../../../../lib/groupEnquiries/notifications.server";
import { createSupabaseGroupEnquiryRepository } from "../../../../lib/groupEnquiries/repository.server";
import { createGroupEnquiryService } from "../../../../lib/groupEnquiries/service";

type HandlerContext = { request: Request };
type AdminGroupEnquiryService = ReturnType<typeof createGroupEnquiryService>;

type CreateAdminGroupEnquiryHandlersArgs = {
  requireVolunteerAdmin: (request: Request) => Promise<AdminUser>;
  service: Pick<
    AdminGroupEnquiryService,
    "listGroupEnquiries" | "getGroupEnquiry" | "updateGroupEnquiry" | "retryGroupEnquiryNotification"
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

async function withAdminGroupEnquiryErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return jsonNoStore({ error: "Invalid group enquiry admin request" }, { status: 400 });
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
        await requireVolunteerAdmin(request);
        const body = (await jsonBody(request)) as { id?: string; action?: string };
        if (!body.id) return jsonNoStore({ error: "Missing group enquiry id" }, { status: 400 });
        if (body.action === "retryNotification") {
          return jsonNoStore(await service.retryGroupEnquiryNotification({ id: body.id }));
        }
        return jsonNoStore(await service.updateGroupEnquiry({ id: body.id, input: body }));
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
