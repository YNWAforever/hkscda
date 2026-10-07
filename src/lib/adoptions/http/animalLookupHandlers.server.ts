import { jsonResponse, withErrors } from "./shared.server";
import type {
  AdoptionCoordinatorService,
  CoordinatorAuthorizer,
  HandlerContext,
} from "./shared.server";

export type AnimalLookupService = Pick<
  AdoptionCoordinatorService,
  "listMatchableAnimals" | "listAnimalPositions" | "listArrivalSources"
>;

export function createAnimalLookupHandlers({
  requireCoordinator,
  service,
}: {
  requireCoordinator: CoordinatorAuthorizer;
  service: AnimalLookupService;
}): {
  listMatchableAnimals(context: HandlerContext): Promise<Response>;
  listAnimalPositions(context: HandlerContext): Promise<Response>;
  listArrivalSources(context: HandlerContext): Promise<Response>;
} {
  return {
    listMatchableAnimals({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        return jsonResponse({ animals: await service.listMatchableAnimals() });
      });
    },

    listAnimalPositions({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        return jsonResponse({ positions: await service.listAnimalPositions() });
      });
    },

    listArrivalSources({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        return jsonResponse({ arrivalSources: await service.listArrivalSources() });
      });
    },
  };
}
