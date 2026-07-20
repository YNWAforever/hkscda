import { z } from "zod";

import { adoptionInformationMutationSchema, deleteEstateRequestSchema } from "./schemas";
import { AdoptionInformationConflictError } from "./service";

type HandlerContext = { request: Request };
type AdminIdentity = { authUserId: string };
type HandlerService = {
  listAdmin(input: unknown): Promise<unknown>;
  upsertFee(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  upsertEstate(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  deleteEstate(input: { actorUserId: string; estateId: string }): Promise<void>;
};

function requestId(request: Request) {
  return request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

function jsonResponse(body: unknown, id: string, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-request-id", id);
  return Response.json(body, { ...init, headers });
}

async function jsonBody(request: Request, id: string) {
  try { return await request.json(); } catch { throw jsonResponse({ error: "Invalid JSON body" }, id, { status: 400 }); }
}

function queryParams(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams);
}

async function withErrors(request: Request, operation: (id: string) => Promise<Response>) {
  const id = requestId(request);
  try {
    return await operation(id);
  } catch (error) {
    if (error instanceof Response) {
      const text = await error.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { body = { error: text || (error.status === 401 ? "Unauthorized" : error.status === 403 ? "Forbidden" : "Request failed") }; }
      return jsonResponse(body, id, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid adoption information request", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, id, { status: 400 });
    }
    if (error instanceof AdoptionInformationConflictError) return jsonResponse({ error: error.message }, id, { status: 409 });
    console.error("Adoption information request failed", { requestId: id, error });
    return jsonResponse({ error: "Could not process adoption information request" }, id, { status: 500 });
  }
}

export function createAdoptionInformationHandlers({
  requireAdoptionInformationAdmin,
  service,
}: {
  requireAdoptionInformationAdmin(request: Request): Promise<AdminIdentity>;
  service: HandlerService;
}) {
  return {
    listAdmin({ request }: HandlerContext) {
      return withErrors(request, async (id) => {
        await requireAdoptionInformationAdmin(request);
        return jsonResponse(await service.listAdmin(queryParams(request)), id);
      });
    },

    upsert({ request }: HandlerContext) {
      return withErrors(request, async (id) => {
        const admin = await requireAdoptionInformationAdmin(request);
        const mutation = adoptionInformationMutationSchema.parse(await jsonBody(request, id));
        if (mutation.resource === "fee") {
          return jsonResponse({ fee: await service.upsertFee({ actorUserId: admin.authUserId, input: mutation.input }) }, id, { status: 201 });
        }
        return jsonResponse({ estate: await service.upsertEstate({ actorUserId: admin.authUserId, input: mutation.input }) }, id, { status: 201 });
      });
    },

    deleteEstate({ request }: HandlerContext) {
      return withErrors(request, async (id) => {
        const admin = await requireAdoptionInformationAdmin(request);
        const body = deleteEstateRequestSchema.parse(await jsonBody(request, id));
        await service.deleteEstate({ actorUserId: admin.authUserId, estateId: body.id });
        return jsonResponse({ ok: true }, id);
      });
    },
  };
}
