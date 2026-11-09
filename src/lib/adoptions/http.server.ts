import type {
  AdoptionCoordinatorService,
  CoordinatorAuthorizer,
  SupporterEmailLookup,
} from "./http/shared.server";
import { createAdopterHandlers } from "./http/adopterHandlers.server";
import { createAnimalLookupHandlers } from "./http/animalLookupHandlers.server";
import { createCaseHandlers } from "./http/caseHandlers.server";
import { createReportingHandlers } from "./http/reportingHandlers.server";
import { createStatusHandlers } from "./http/statusHandlers.server";
import { createTaskHandlers } from "./http/taskHandlers.server";

type CreateArgs = {
  requireCoordinator: CoordinatorAuthorizer;
  requireStatusAdmin: CoordinatorAuthorizer;
  service: AdoptionCoordinatorService;
  /** OPS-04: manual intake's archived-supporter lookup (service-role repository). */
  lookupSupporterByEmail?: SupporterEmailLookup;
};

export function createAdoptionCoordinatorHandlers(args: CreateArgs) {
  return {
    ...createStatusHandlers(args),
    ...createCaseHandlers(args),
    ...createTaskHandlers(args),
    ...createReportingHandlers(args),
    ...createAdopterHandlers(args),
    ...createAnimalLookupHandlers(args),
  };
}
