import { z } from "zod";

import type { AdminAccessUser } from "./accessManagement.server";
import { AdminAccessError } from "./accessManagement.server";

type HandlerContext = {
  request: Request;
  params?: Record<string, string | undefined>;
};

type AccessService = {
  listUsers(): Promise<unknown>;
  inviteUser(args: { actor: AdminAccessUser; input: unknown }): Promise<unknown>;
  resendInvite(args: { actor: AdminAccessUser; userId: string }): Promise<unknown>;
  updateUser(args: { actor: AdminAccessUser; userId: string; input: unknown }): Promise<unknown>;
  listAudit(): Promise<unknown>;
};

type CreateAdminAccessHandlersArgs = {
  requireAccessAdmin: (request: Request) => Promise<AdminAccessUser>;
  service: AccessService;
};

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function requiredId(params: HandlerContext["params"]) {
  const id = params?.id;
  if (!id) {
    throw jsonResponse({ error: "Missing admin user id" }, { status: 400 });
  }
  return id;
}

async function withAccessErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof AdminAccessError) {
      return jsonResponse({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid access management request" }, { status: 400 });
    }

    console.error(error);
    return jsonResponse({ error: "Could not process access management request" }, { status: 500 });
  }
}

export function createAdminAccessHandlers({
  requireAccessAdmin,
  service,
}: CreateAdminAccessHandlersArgs) {
  return {
    listUsers({ request }: HandlerContext) {
      return withAccessErrors(async () => {
        await requireAccessAdmin(request);
        return jsonResponse(await service.listUsers());
      });
    },

    inviteUser({ request }: HandlerContext) {
      return withAccessErrors(async () => {
        const actor = await requireAccessAdmin(request);
        const user = await service.inviteUser({ actor, input: await jsonBody(request) });
        return jsonResponse({ user }, { status: 201 });
      });
    },

    resendInvite({ request, params }: HandlerContext) {
      return withAccessErrors(async () => {
        const userId = requiredId(params);
        const actor = await requireAccessAdmin(request);
        const user = await service.resendInvite({ actor, userId });
        return jsonResponse({ user });
      });
    },

    updateUser({ request, params }: HandlerContext) {
      return withAccessErrors(async () => {
        const userId = requiredId(params);
        const actor = await requireAccessAdmin(request);
        const user = await service.updateUser({
          actor,
          userId,
          input: await jsonBody(request),
        });
        return jsonResponse({ user });
      });
    },

    listAudit({ request }: HandlerContext) {
      return withAccessErrors(async () => {
        await requireAccessAdmin(request);
        return jsonResponse(await service.listAudit());
      });
    },
  };
}
