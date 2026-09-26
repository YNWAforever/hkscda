import { z } from "zod";

import { adoptionInstructionContentSchema } from "./schemas";
import {
  AdoptionInstructionError,
  createAdoptionInstructionService,
  type AdoptionInstructionActor,
} from "./service";

type AdoptionInstructionService = ReturnType<typeof createAdoptionInstructionService>;

const positiveVersionSchema = z.number().int().positive();
const draftBodySchema = z.object({ expectedPageVersion: positiveVersionSchema }).strict();
const updateBodySchema = z
  .object({ expectedVersion: positiveVersionSchema, content: adoptionInstructionContentSchema })
  .strict();
const publishBodySchema = z
  .object({
    expectedVersion: positiveVersionSchema,
    idempotencyKey: z.string().trim().min(16).max(200),
  })
  .strict();
const restoreBodySchema = z.object({ revisionId: z.string().uuid() }).strict();

const messages = {
  unauthorized: "Authentication is required.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "Adoption instruction content was not found.",
  conflict: "This adoption instruction draft has changed.",
  validation: "Review the highlighted fields.",
  internal: "The adoption instruction request could not be completed.",
} as const;

function jsonNoStore(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

function fieldErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>) {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const path = issue.path.length ? issue.path.map(String).join(".") : "request";
    (fields[path] ??= []).push(issue.message);
  }
  return fields;
}

function validationResponse(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
) {
  return jsonNoStore(
    {
      error: {
        code: "validation",
        message: messages.validation,
        fields: fieldErrors(issues),
      },
    },
    422,
  );
}

export function adoptionInstructionInternalErrorResponse() {
  return jsonNoStore({ error: { code: "internal", message: messages.internal } }, 500);
}

function adoptionInstructionErrorResponse(error: AdoptionInstructionError) {
  return jsonNoStore({ error: { code: error.code, message: messages[error.code] } }, error.status);
}

async function withHttpErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof z.ZodError) return validationResponse(error.issues);
    if (error instanceof AdoptionInstructionError) return adoptionInstructionErrorResponse(error);
    if (error instanceof Response && (error.status === 401 || error.status === 403)) {
      const code = error.status === 401 ? "unauthorized" : "forbidden";
      return jsonNoStore({ error: { code, message: messages[code] } }, error.status);
    }
    return adoptionInstructionInternalErrorResponse();
  }
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new z.ZodError([
      { code: "custom", path: ["body"], message: "Request body must be valid JSON." },
    ]);
  }
}

function requirePublishingAdmin(actor: AdoptionInstructionActor) {
  if (actor.role !== "admin") throw new AdoptionInstructionError("forbidden", 403);
}

export function createAdoptionInstructionHandlers({
  requireActor,
  service,
}: {
  requireActor: (request: Request) => Promise<AdoptionInstructionActor>;
  service: AdoptionInstructionService;
}) {
  return {
    get(request: Request) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        return jsonNoStore(await service.getAdminPage({ actor }));
      });
    },

    ensureDraft(request: Request) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const body = draftBodySchema.parse(await jsonBody(request));
        return jsonNoStore(await service.ensureDraft({ actor, ...body }));
      });
    },

    updateDraft(request: Request) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const body = updateBodySchema.parse(await jsonBody(request));
        return jsonNoStore(await service.updateDraft({ actor, ...body }));
      });
    },

    preview(request: Request) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        return jsonNoStore(await service.preview({ actor }));
      });
    },

    publish(request: Request) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        requirePublishingAdmin(actor);
        const body = publishBodySchema.parse(await jsonBody(request));
        return jsonNoStore(await service.publish({ actor, ...body }));
      });
    },

    archiveDraft(request: Request) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        requirePublishingAdmin(actor);
        const body = z
          .object({ expectedVersion: positiveVersionSchema })
          .strict()
          .parse(await jsonBody(request));
        return jsonNoStore(await service.archiveDraft({ actor, ...body }));
      });
    },

    restore(request: Request) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        requirePublishingAdmin(actor);
        const body = restoreBodySchema.parse(await jsonBody(request));
        return jsonNoStore(await service.restore({ actor, ...body }));
      });
    },
  };
}
