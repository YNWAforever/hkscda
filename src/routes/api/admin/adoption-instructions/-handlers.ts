import { requireAdmin, type AdminUser } from "../../../../lib/admin/session.server";
import {
  adoptionInstructionInternalErrorResponse,
  createAdoptionInstructionHandlers,
} from "../../../../lib/adoptionInstructions/http.server";
import { createSupabaseAdoptionInstructionRepository } from "../../../../lib/adoptionInstructions/repository.server";
import {
  createAdoptionInstructionService,
  type AdoptionInstructionActor,
} from "../../../../lib/adoptionInstructions/service";
import { createSupabaseServiceClient } from "../../../../lib/supabase.server";

type AdoptionInstructionHandlers = ReturnType<typeof createAdoptionInstructionHandlers>;
type HandlerFactory = () => AdoptionInstructionHandlers;

export function toAdoptionInstructionActor(user: AdminUser): AdoptionInstructionActor {
  if (user.role !== "staff" && user.role !== "admin")
    throw new Response("Forbidden", { status: 403 });
  return { authUserId: user.authUserId, role: user.role };
}

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const repository = createSupabaseAdoptionInstructionRepository(client);
  const service = createAdoptionInstructionService({ repository });
  return createAdoptionInstructionHandlers({
    requireActor: async (request) => {
      const user = await requireAdmin(request, ["staff", "admin"], client);
      return toAdoptionInstructionActor(user);
    },
    service,
  });
}

async function withComposition(
  factory: HandlerFactory,
  invoke: (handlers: AdoptionInstructionHandlers) => Promise<Response>,
) {
  try {
    return await invoke(factory());
  } catch {
    return adoptionInstructionInternalErrorResponse();
  }
}

export function createAdoptionInstructionRouteDelegates(factory: HandlerFactory = createHandlers) {
  return {
    get: (request: Request) => withComposition(factory, (handlers) => handlers.get(request)),
    ensureDraft: (request: Request) =>
      withComposition(factory, (handlers) => handlers.ensureDraft(request)),
    updateDraft: (request: Request) =>
      withComposition(factory, (handlers) => handlers.updateDraft(request)),
    preview: (request: Request) =>
      withComposition(factory, (handlers) => handlers.preview(request)),
    publish: (request: Request) =>
      withComposition(factory, (handlers) => handlers.publish(request)),
    restore: (request: Request) =>
      withComposition(factory, (handlers) => handlers.restore(request)),
  };
}

export const adoptionInstructionRouteHandlers = createAdoptionInstructionRouteDelegates();
