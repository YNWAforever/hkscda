import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { createKnowledgeService } from "./service";

type HandlerContext = { request: Request };
type KnowledgeService = ReturnType<typeof createKnowledgeService>;

type CreateAdminKnowledgeHandlersArgs = {
  requireKnowledgeAdmin: (request: Request) => Promise<AdminUser>;
  service: Pick<KnowledgeService, "listAdmin" | "upsert" | "remove">;
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

async function withKnowledgeErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return jsonNoStore({ error: "Invalid knowledge request" }, { status: 400 });
    console.error(error);
    return jsonNoStore({ error: "Could not process knowledge request" }, { status: 500 });
  }
}

export function createAdminKnowledgeHandlers({ requireKnowledgeAdmin, service }: CreateAdminKnowledgeHandlersArgs) {
  return {
    list({ request }: HandlerContext) {
      return withKnowledgeErrors(async () => {
        await requireKnowledgeAdmin(request);
        return jsonNoStore(await service.listAdmin(searchParams(request)));
      });
    },

    upsert({ request }: HandlerContext) {
      return withKnowledgeErrors(async () => {
        const admin = await requireKnowledgeAdmin(request);
        return jsonNoStore({ post: await service.upsert({ actorUserId: admin.id, input: await jsonBody(request) }) });
      });
    },

    remove({ request }: HandlerContext) {
      return withKnowledgeErrors(async () => {
        const admin = await requireKnowledgeAdmin(request);
        const body = (await jsonBody(request)) as { id?: string };
        if (!body.id) return jsonNoStore({ error: "Missing knowledge post id" }, { status: 400 });
        await service.remove({ actorUserId: admin.id, id: body.id });
        return jsonNoStore({ ok: true });
      });
    },
  };
}
