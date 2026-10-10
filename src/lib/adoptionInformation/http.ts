import { z } from "zod";
import { readAdminJson } from "../http/adminJson.server";
import { RequestBodyTooLargeError } from "../http/publicJson.server";

import {
  adoptionInformationMutationSchema,
  deleteEstateRequestSchema,
  estateCommandRequestSchema,
  feeCommandRequestSchema,
} from "./schemas";
import { AdoptionInformationConflictError } from "./service";

type HandlerContext = { request: Request };
type AdminIdentity = { authUserId: string };
type HandlerService = {
  listAdmin(input: unknown): Promise<unknown>;
  upsertFee(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  updateFeeContent(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  reorderFees(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  createEstate(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  updateEstate(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  setEstatePublication(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  deleteEstate(input: { actorUserId: string; estateId: string; reason: string }): Promise<void>;
  upsertRule(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  upsertCareTopic(input: { actorUserId: string; input: unknown }): Promise<unknown>;
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
  try {
    return await readAdminJson(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      throw jsonResponse({ error: "Request body too large" }, id, { status: 413 });
    throw jsonResponse({ error: "Invalid JSON body" }, id, { status: 400 });
  }
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
      try {
        body = JSON.parse(text);
      } catch {
        body = {
          error:
            text ||
            (error.status === 401
              ? "Unauthorized"
              : error.status === 403
                ? "Forbidden"
                : "Request failed"),
        };
      }
      return jsonResponse(body, id, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return jsonResponse(
        {
          error: "Invalid adoption information request",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        id,
        { status: 400 },
      );
    }
    if (error instanceof AdoptionInformationConflictError)
      return jsonResponse({ error: error.message }, id, { status: 409 });
    if (error && typeof error === "object" && "code" in error && error.code === "P0002")
      return jsonResponse({ error: "Adoption information item not found" }, id, { status: 404 });
    if (error && typeof error === "object" && "code" in error && error.code === "42501")
      return jsonResponse({ error: "Forbidden" }, id, { status: 403 });
    console.error("Adoption information request failed", { requestId: id, error });
    return jsonResponse({ error: "Could not process adoption information request" }, id, {
      status: 500,
    });
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
        const body = await jsonBody(request, id);
        if (
          body &&
          typeof body === "object" &&
          "resource" in body &&
          body.resource === "fee" &&
          "command" in body
        ) {
          const command = feeCommandRequestSchema.parse(body);
          if (command.command === "content")
            return jsonResponse(
              {
                fee: await service.updateFeeContent({
                  actorUserId: admin.authUserId,
                  input: command.input,
                }),
              },
              id,
            );
          return jsonResponse(
            {
              fees: await service.reorderFees({
                actorUserId: admin.authUserId,
                input: command.input,
              }),
            },
            id,
          );
        }
        if (body && typeof body === "object" && "resource" in body && body.resource === "estate") {
          const command = estateCommandRequestSchema.parse(body);
          const estate =
            command.command === "create"
              ? await service.createEstate({ actorUserId: admin.authUserId, input: command.input })
              : command.command === "update"
                ? await service.updateEstate({
                    actorUserId: admin.authUserId,
                    input: command.input,
                  })
                : await service.setEstatePublication({
                    actorUserId: admin.authUserId,
                    input: command.input,
                  });
          return jsonResponse({ estate }, id, { status: command.command === "create" ? 201 : 200 });
        }
        const mutation = adoptionInformationMutationSchema.parse(body);
        if (mutation.resource === "fee") {
          return jsonResponse(
            {
              fee: await service.upsertFee({
                actorUserId: admin.authUserId,
                input: mutation.input,
              }),
            },
            id,
            { status: 201 },
          );
        }
        if (mutation.resource === "rule") {
          return jsonResponse(
            {
              rule: await service.upsertRule({
                actorUserId: admin.authUserId,
                input: mutation.input,
              }),
            },
            id,
            { status: 201 },
          );
        }
        return jsonResponse(
          {
            careTopic: await service.upsertCareTopic({
              actorUserId: admin.authUserId,
              input: mutation.input,
            }),
          },
          id,
          { status: 201 },
        );
      });
    },

    deleteEstate({ request }: HandlerContext) {
      return withErrors(request, async (id) => {
        const admin = await requireAdoptionInformationAdmin(request);
        const body = deleteEstateRequestSchema.parse(await jsonBody(request, id));
        await service.deleteEstate({
          actorUserId: admin.authUserId,
          estateId: body.id,
          reason: body.reason,
        });
        return jsonResponse({ ok: true }, id);
      });
    },
  };
}
