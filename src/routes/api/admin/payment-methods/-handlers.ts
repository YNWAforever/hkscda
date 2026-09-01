import { requireAdmin, type AdminUser } from "../../../../lib/admin/session.server";
import {
  createPaymentPublicConfigHandlers,
  paymentPublicConfigInternalErrorResponse,
} from "../../../../lib/paymentPublicConfig/http.server";
import { createSupabasePaymentPublicConfigRepository } from "../../../../lib/paymentPublicConfig/repository.server";
import {
  createPaymentPublicConfigService,
  type PaymentPublicConfigActor,
} from "../../../../lib/paymentPublicConfig/service";
import { createSupabaseServiceClient } from "../../../../lib/supabase.server";

type PaymentPublicConfigHandlers = ReturnType<typeof createPaymentPublicConfigHandlers>;
type HandlerFactory = () => PaymentPublicConfigHandlers;
type ConfigParams = { id?: string };

export function toPaymentPublicConfigActor(user: AdminUser): PaymentPublicConfigActor {
  if (user.role !== "staff" && user.role !== "treasurer" && user.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }
  return {
    adminUserId: user.id,
    authUserId: user.authUserId,
    role: user.role,
  };
}

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const repository = createSupabasePaymentPublicConfigRepository(client);
  const service = createPaymentPublicConfigService(repository);

  return createPaymentPublicConfigHandlers({
    requireActor: async (request) => {
      const user = await requireAdmin(request, ["staff", "treasurer", "admin"], client);
      return toPaymentPublicConfigActor(user);
    },
    service,
  });
}

async function withComposition(
  factory: HandlerFactory,
  invoke: (handlers: PaymentPublicConfigHandlers) => Promise<Response>,
) {
  try {
    return await invoke(factory());
  } catch {
    return paymentPublicConfigInternalErrorResponse();
  }
}

export function createPaymentPublicConfigRouteDelegates(factory: HandlerFactory = createHandlers) {
  return {
    list: (request: Request) => withComposition(factory, (handlers) => handlers.list(request)),
    create: (request: Request) => withComposition(factory, (handlers) => handlers.create(request)),
    get: (request: Request, params: ConfigParams) =>
      withComposition(factory, (handlers) => handlers.get(request, params)),
    update: (request: Request, params: ConfigParams) =>
      withComposition(factory, (handlers) => handlers.update(request, params)),
    submit: (request: Request, params: ConfigParams) =>
      withComposition(factory, (handlers) => handlers.submit(request, params)),
    withdraw: (request: Request, params: ConfigParams) =>
      withComposition(factory, (handlers) => handlers.withdraw(request, params)),
    returnToDraft: (request: Request, params: ConfigParams) =>
      withComposition(factory, (handlers) => handlers.returnToDraft(request, params)),
    publish: (request: Request, params: ConfigParams) =>
      withComposition(factory, (handlers) => handlers.publish(request, params)),
  };
}

export const paymentMethodRouteHandlers = createPaymentPublicConfigRouteDelegates();
