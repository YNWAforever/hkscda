import { z } from "zod";

import { aboutPageUpsertRequestSchema } from "./schemas";
import type { AdminUser } from "../donations/supabase.server";
import type { createAboutPagesService } from "./service";

type HandlerContext = { request: Request };
type AboutPagesService = ReturnType<typeof createAboutPagesService>;

type CreateAdminAboutPagesHandlersArgs = {
  requireAboutPagesAdmin: (request: Request) => Promise<AdminUser>;
  service: Pick<AboutPagesService, "listPublic" | "upsertAdmin">;
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

async function withAboutPagesErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return jsonNoStore(
        {
          error: "Invalid about page content",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    console.error(error);
    return jsonNoStore({ error: "Could not process about page request" }, { status: 500 });
  }
}

export function createAdminAboutPagesHandlers({
  requireAboutPagesAdmin,
  service,
}: CreateAdminAboutPagesHandlersArgs) {
  return {
    list({ request }: HandlerContext) {
      return withAboutPagesErrors(async () => {
        await requireAboutPagesAdmin(request);
        return jsonNoStore(await service.listPublic());
      });
    },

    upsert({ request }: HandlerContext) {
      return withAboutPagesErrors(async () => {
        const admin = await requireAboutPagesAdmin(request);
        const body = aboutPageUpsertRequestSchema.parse(await jsonBody(request));
        const content = await service.upsertAdmin({
          actorUserId: admin.authUserId,
          pageSlug: body.pageSlug,
          content: body.content,
        });
        return jsonNoStore({ pageSlug: body.pageSlug, content });
      });
    },
  };
}
