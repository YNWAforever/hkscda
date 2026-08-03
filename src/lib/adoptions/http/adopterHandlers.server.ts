import { jsonResponse, queryParams, requiredUuid, withErrors } from "./shared.server";
import type {
  AdoptionCoordinatorService,
  CoordinatorAuthorizer,
  HandlerContext,
} from "./shared.server";

export type AdopterService = Pick<
  AdoptionCoordinatorService,
  "listAdopters" | "searchManualCaseIdentity" | "getAdopterDetail"
>;

type CreateAdopterHandlersArgs = {
  requireCoordinator: CoordinatorAuthorizer;
  service: AdopterService;
};

export function createAdopterHandlers({ requireCoordinator, service }: CreateAdopterHandlersArgs) {
  return {
    listAdopters({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = queryParams(request);
        return jsonResponse(await service.listAdopters(search));
      });
    },

    searchManualCaseIdentity({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = queryParams(request);
        return jsonResponse(await service.searchManualCaseIdentity(search));
      });
    },

    getAdopter({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const adopterProfileId = requiredUuid(params, "id");
        await requireCoordinator(request);
        const adopter = await service.getAdopterDetail(adopterProfileId);
        if (!adopter) {
          return jsonResponse({ error: "Adopter profile not found" }, { status: 404 });
        }
        return jsonResponse({ adopter });
      });
    },
  };
}
