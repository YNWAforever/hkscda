import { requireAdmin, type AdminUser } from "../../../../lib/admin/session.server";
import {
  adoptionGuideReleaseInternalErrorResponse,
  createAdoptionGuideReleaseHandlers,
} from "../../../../lib/adoptionGuideReleases/http.server";
import { createSupabaseAdoptionGuideReleaseRepository } from "../../../../lib/adoptionGuideReleases/repository.server";
import {
  createAdoptionGuideReleaseService,
  type AdoptionGuideActor,
} from "../../../../lib/adoptionGuideReleases/service";
import { createSupabaseServiceClient } from "../../../../lib/supabase.server";

type AdoptionGuideReleaseHandlers = ReturnType<typeof createAdoptionGuideReleaseHandlers>;
type HandlerFactory = () => AdoptionGuideReleaseHandlers;
type ReleaseParams = { id?: string };

export function toAdoptionGuideActor(user: AdminUser): AdoptionGuideActor {
  if (user.role !== "staff" && user.role !== "admin") {
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
  const repository = createSupabaseAdoptionGuideReleaseRepository(client);
  const service = createAdoptionGuideReleaseService(repository);

  return createAdoptionGuideReleaseHandlers({
    requireActor: async (request) => {
      const user = await requireAdmin(request, ["staff", "admin"], client);
      return toAdoptionGuideActor(user);
    },
    service,
  });
}

async function withComposition(
  factory: HandlerFactory,
  invoke: (handlers: AdoptionGuideReleaseHandlers) => Promise<Response>,
) {
  try {
    return await invoke(factory());
  } catch {
    return adoptionGuideReleaseInternalErrorResponse();
  }
}

export function createAdoptionGuideReleaseRouteDelegates(factory: HandlerFactory = createHandlers) {
  return {
    list: (request: Request) => withComposition(factory, (handlers) => handlers.list(request)),
    create: (request: Request) => withComposition(factory, (handlers) => handlers.create(request)),
    get: (request: Request, params: ReleaseParams) =>
      withComposition(factory, (handlers) => handlers.get(request, params)),
    update: (request: Request, params: ReleaseParams) =>
      withComposition(factory, (handlers) => handlers.update(request, params)),
    submit: (request: Request, params: ReleaseParams) =>
      withComposition(factory, (handlers) => handlers.submit(request, params)),
    withdraw: (request: Request, params: ReleaseParams) =>
      withComposition(factory, (handlers) => handlers.withdraw(request, params)),
    returnToDraft: (request: Request, params: ReleaseParams) =>
      withComposition(factory, (handlers) => handlers.returnToDraft(request, params)),
    preview: (request: Request, params: ReleaseParams) =>
      withComposition(factory, (handlers) => handlers.preview(request, params)),
    publish: (request: Request, params: ReleaseParams) =>
      withComposition(factory, (handlers) => handlers.publish(request, params)),
  };
}

export const releaseRouteHandlers = createAdoptionGuideReleaseRouteDelegates();
