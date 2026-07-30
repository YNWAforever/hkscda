import { z } from "zod";

import {
  adoptionGuideDraftInputSchema,
  adoptionGuideMutationSchema,
  adoptionGuidePublishSchema,
  adoptionGuideReleaseIdSchema,
  adoptionGuideSpeciesSchema,
  adoptionGuideStateSchema,
  adoptionGuideTransitionSchema,
} from "./schemas";
import {
  AdoptionGuideReleaseError,
  createAdoptionGuideReleaseService,
  type AdoptionGuideActor,
} from "./service";
import type { AdoptionGuideReadinessIssue } from "./types";

type AdoptionGuideReleaseService = ReturnType<typeof createAdoptionGuideReleaseService>;

type ReleaseParams = {
  id?: string;
};

const adminQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().min(1).max(200).optional(),
  species: adoptionGuideSpeciesSchema.optional(),
  state: adoptionGuideStateSchema.optional(),
});

const releaseParamsSchema = z.object({
  id: adoptionGuideReleaseIdSchema,
});

const defaultMessages = {
  unauthorized: "Authentication is required.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "Adoption guide release not found.",
  conflict: "This adoption guide release changed or cannot make that transition.",
  invalid: "The adoption guide release is not ready for this action.",
  internal: "The adoption guide release request could not be completed.",
} as const;

function jsonNoStore(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function fieldErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>) {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "request";
    (fields[path] ??= []).push(issue.message);
  }
  return fields;
}

function readinessFieldErrors(issues: AdoptionGuideReadinessIssue[]) {
  return fieldErrors(
    issues.map((issue) => ({
      path: [issue.field],
      message: issue.message,
    })),
  );
}

function validationResponse(fields: Record<string, string[]>) {
  return jsonNoStore(
    {
      error: {
        code: "validation_error",
        message: "Review the highlighted fields.",
        fields,
      },
    },
    400,
  );
}

function adoptionGuideErrorResponse(error: AdoptionGuideReleaseError) {
  if (error.code === "invalid" && error.issues?.length) {
    return validationResponse(readinessFieldErrors(error.issues));
  }

  const status = error.code === "invalid" ? 400 : error.status;
  const message = error.code === "internal" ? defaultMessages.internal : error.message;
  return jsonNoStore({ error: { code: error.code, message } }, status);
}

function authResponse(status: 401 | 403) {
  const code = status === 401 ? "unauthorized" : "forbidden";
  return jsonNoStore({ error: { code, message: defaultMessages[code] } }, status);
}

async function withHttpErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationResponse(fieldErrors(error.issues));
    }
    if (error instanceof AdoptionGuideReleaseError) {
      return adoptionGuideErrorResponse(error);
    }
    if (error instanceof Response) {
      if (error.status === 401 || error.status === 403) {
        return authResponse(error.status);
      }
    }
    return jsonNoStore(
      {
        error: {
          code: "internal",
          message: defaultMessages.internal,
        },
      },
      500,
    );
  }
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["body"],
        message: "Request body must be valid JSON.",
      },
    ]);
  }
}

function releaseId(params: ReleaseParams) {
  return releaseParamsSchema.parse(params).id;
}

function requirePublishingAdmin(actor: AdoptionGuideActor) {
  if (actor.role !== "admin") {
    throw new AdoptionGuideReleaseError("forbidden", 403);
  }
}

export function createAdoptionGuideReleaseHandlers({
  requireActor,
  service,
}: {
  requireActor: (request: Request) => Promise<AdoptionGuideActor>;
  service: AdoptionGuideReleaseService;
}) {
  return {
    list(request: Request) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const query = adminQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
        return jsonNoStore(await service.list({ actor, query }));
      });
    },

    create(request: Request) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const input = adoptionGuideDraftInputSchema.parse(await jsonBody(request));
        return jsonNoStore(await service.createDraft({ actor, input }), 201);
      });
    },

    get(request: Request, params: ReleaseParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        return jsonNoStore(await service.get({ actor, id: releaseId(params) }));
      });
    },

    update(request: Request, params: ReleaseParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const input = adoptionGuideMutationSchema.parse(await jsonBody(request));
        return jsonNoStore(await service.updateDraft({ actor, id: releaseId(params), input }));
      });
    },

    submit(request: Request, params: ReleaseParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const input = adoptionGuideTransitionSchema.parse(await jsonBody(request));
        return jsonNoStore(
          await service.submit({
            actor,
            id: releaseId(params),
            expectedVersion: input.expectedVersion,
          }),
        );
      });
    },

    withdraw(request: Request, params: ReleaseParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const input = adoptionGuideTransitionSchema.parse(await jsonBody(request));
        return jsonNoStore(
          await service.withdraw({
            actor,
            id: releaseId(params),
            expectedVersion: input.expectedVersion,
          }),
        );
      });
    },

    returnToDraft(request: Request, params: ReleaseParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        requirePublishingAdmin(actor);
        const input = adoptionGuideTransitionSchema.parse(await jsonBody(request));
        return jsonNoStore(
          await service.returnToDraft({
            actor,
            id: releaseId(params),
            expectedVersion: input.expectedVersion,
          }),
        );
      });
    },

    preview(request: Request, params: ReleaseParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        return jsonNoStore(await service.preview({ actor, id: releaseId(params) }));
      });
    },

    publish(request: Request, params: ReleaseParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        requirePublishingAdmin(actor);
        const input = adoptionGuidePublishSchema.parse(await jsonBody(request));
        return jsonNoStore(
          await service.publish({
            actor,
            id: releaseId(params),
            expectedVersion: input.expectedVersion,
            idempotencyKey: input.idempotencyKey,
          }),
        );
      });
    },
  };
}
