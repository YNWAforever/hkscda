import type { AdoptionCoordinatorService, CoordinatorAuthorizer } from "./http/shared.server";
import { createAdopterHandlers } from "./http/adopterHandlers.server";
import { createCaseHandlers } from "./http/caseHandlers.server";
import { createReportingHandlers } from "./http/reportingHandlers.server";
import { createStatusHandlers } from "./http/statusHandlers.server";
import { createTaskHandlers } from "./http/taskHandlers.server";

type CreateArgs = {
  requireCoordinator: CoordinatorAuthorizer;
  requireStatusAdmin: CoordinatorAuthorizer;
  service: AdoptionCoordinatorService;
};

export function createAdoptionCoordinatorHandlers(args: CreateArgs) {
  return {
    ...createStatusHandlers(args),
    ...createCaseHandlers(args),
    ...createTaskHandlers(args),
    ...createReportingHandlers(args),
    ...createAdopterHandlers(args),
  };
}
