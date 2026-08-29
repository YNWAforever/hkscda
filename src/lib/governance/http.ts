import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { createGovernanceService } from "./service";

type HandlerContext = { request: Request };
type GovernanceService = ReturnType<typeof createGovernanceService>;

type CreateAdminGovernanceHandlersArgs = {
  requireGovernanceAdmin: (request: Request) => Promise<AdminUser>;
  service: Pick<GovernanceService, "listAdmin" | "upsert" | "deactivate">;
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

async function withGovernanceErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError)
      return jsonNoStore({ error: "Invalid governance request" }, { status: 400 });
    console.error(error);
    return jsonNoStore({ error: "Could not process governance request" }, { status: 500 });
  }
}

export function createAdminGovernanceHandlers({
  requireGovernanceAdmin,
  service,
}: CreateAdminGovernanceHandlersArgs) {
  return {
    list({ request }: HandlerContext) {
      return withGovernanceErrors(async () => {
        await requireGovernanceAdmin(request);
        return jsonNoStore(await service.listAdmin());
      });
    },

    upsert({ request }: HandlerContext) {
      return withGovernanceErrors(async () => {
        const admin = await requireGovernanceAdmin(request);
        return jsonNoStore({
          member: await service.upsert({ actorUserId: admin.id, input: await jsonBody(request) }),
        });
      });
    },

    deactivate({ request }: HandlerContext) {
      return withGovernanceErrors(async () => {
        const admin = await requireGovernanceAdmin(request);
        const body = (await jsonBody(request)) as { id?: string };
        if (!body.id) return jsonNoStore({ error: "Missing board member id" }, { status: 400 });
        await service.deactivate({ actorUserId: admin.id, id: body.id });
        return jsonNoStore({ ok: true });
      });
    },
  };
}
