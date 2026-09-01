import { z } from "zod";

import {
  paymentPublicConfigDraftInputSchema,
  paymentPublicConfigIdSchema,
  paymentPublicConfigMethodSchema,
  paymentPublicConfigMutationSchema,
  paymentPublicConfigPublishSchema,
  paymentPublicConfigStateSchema,
  paymentPublicConfigTransitionSchema,
} from "./schemas";
import {
  PaymentPublicConfigError,
  createPaymentPublicConfigService,
  type PaymentPublicConfigActor,
} from "./service";

type PaymentPublicConfigService = ReturnType<typeof createPaymentPublicConfigService>;

type ConfigParams = {
  id?: string;
};

const adminQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  method: paymentPublicConfigMethodSchema.optional(),
  state: paymentPublicConfigStateSchema.optional(),
});

const configParamsSchema = z.object({
  id: paymentPublicConfigIdSchema,
});

const defaultMessages = {
  unauthorized: "Authentication is required.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "Payment method configuration not found.",
  conflict: "This configuration changed or cannot make that transition.",
  invalid: "The configuration is not ready for this action.",
  internal: "The payment configuration request could not be completed.",
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

function paymentPublicConfigErrorResponse(error: PaymentPublicConfigError) {
  const status = error.code === "invalid" ? 400 : error.status;
  return jsonNoStore({ error: { code: error.code, message: defaultMessages[error.code] } }, status);
}

export function paymentPublicConfigInternalErrorResponse() {
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
    if (error instanceof PaymentPublicConfigError) {
      return paymentPublicConfigErrorResponse(error);
    }
    if (error instanceof Response) {
      if (error.status === 401 || error.status === 403) {
        return authResponse(error.status);
      }
    }
    return paymentPublicConfigInternalErrorResponse();
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

function configId(params: ConfigParams) {
  return configParamsSchema.parse(params).id;
}

function requirePublishingRole(actor: PaymentPublicConfigActor) {
  if (actor.role !== "treasurer" && actor.role !== "admin") {
    throw new PaymentPublicConfigError("forbidden", 403);
  }
}

export function createPaymentPublicConfigHandlers({
  requireActor,
  service,
}: {
  requireActor: (request: Request) => Promise<PaymentPublicConfigActor>;
  service: PaymentPublicConfigService;
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
        const input = paymentPublicConfigDraftInputSchema.parse(await jsonBody(request));
        return jsonNoStore(await service.createDraft({ actor, input }), 201);
      });
    },

    get(request: Request, params: ConfigParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        return jsonNoStore(await service.get({ actor, id: configId(params) }));
      });
    },

    update(request: Request, params: ConfigParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const input = paymentPublicConfigMutationSchema.parse(await jsonBody(request));
        return jsonNoStore(await service.updateDraft({ actor, id: configId(params), input }));
      });
    },

    submit(request: Request, params: ConfigParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const input = paymentPublicConfigTransitionSchema.parse(await jsonBody(request));
        return jsonNoStore(
          await service.submit({
            actor,
            id: configId(params),
            expectedVersion: input.expectedVersion,
          }),
        );
      });
    },

    withdraw(request: Request, params: ConfigParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const input = paymentPublicConfigTransitionSchema.parse(await jsonBody(request));
        return jsonNoStore(
          await service.withdraw({
            actor,
            id: configId(params),
            expectedVersion: input.expectedVersion,
          }),
        );
      });
    },

    returnToDraft(request: Request, params: ConfigParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        requirePublishingRole(actor);
        const input = paymentPublicConfigTransitionSchema.parse(await jsonBody(request));
        return jsonNoStore(
          await service.returnToDraft({
            actor,
            id: configId(params),
            expectedVersion: input.expectedVersion,
          }),
        );
      });
    },

    publish(request: Request, params: ConfigParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        requirePublishingRole(actor);
        const input = paymentPublicConfigPublishSchema.parse(await jsonBody(request));
        return jsonNoStore(
          await service.publish({
            actor,
            id: configId(params),
            expectedVersion: input.expectedVersion,
            idempotencyKey: input.idempotencyKey,
          }),
        );
      });
    },
  };
}
