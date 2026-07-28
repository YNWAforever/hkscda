import {
  jsonBody,
  jsonResponse,
  queryParams,
  requiredUuid,
  withErrors,
} from "./http/shared.server";
import type {
  AdoptionCoordinatorService,
  CoordinatorAuthorizer,
  HandlerContext,
} from "./http/shared.server";
import { createReportingHandlers } from "./http/reportingHandlers.server";
import { createStatusHandlers } from "./http/statusHandlers.server";
import { createTaskHandlers } from "./http/taskHandlers.server";

type CreateAdoptionCoordinatorHandlersArgs = {
  requireCoordinator: CoordinatorAuthorizer;
  requireStatusAdmin: CoordinatorAuthorizer;
  service: AdoptionCoordinatorService;
};
export function createAdoptionCoordinatorHandlers({
  requireCoordinator,
  requireStatusAdmin,
  service,
}: CreateAdoptionCoordinatorHandlersArgs) {
  return {
    ...createStatusHandlers({ requireCoordinator, requireStatusAdmin, service }),
    ...createTaskHandlers({ requireCoordinator, service }),

    listCases({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = queryParams(request);
        return jsonResponse(await service.listCases(search));
      });
    },

    listIntakeItems({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = queryParams(request);
        return jsonResponse(await service.listIntakeItems(search));
      });
    },

    listAnimalPipeline({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = queryParams(request);
        return jsonResponse(await service.listAnimalPipeline(search));
      });
    },

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

    createManualCase({ request }: HandlerContext) {
      return withErrors(async () => {
        const admin = await requireCoordinator(request);
        const result = await service.createManualCase({
          actorUserId: admin.authUserId,
          input: await jsonBody(request),
        });
        return jsonResponse(
          {
            case: { id: result.caseId },
            supporterId: result.supporterId,
            adopterProfileId: result.adopterProfileId,
            taskId: result.taskId,
          },
          { status: 201 },
        );
      });
    },

    ...createReportingHandlers({ requireCoordinator, service }),

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

    getCase({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const caseId = requiredUuid(params, "id");
        await requireCoordinator(request);
        const detail = await service.getCaseDetail(caseId);
        if (!detail) {
          return jsonResponse({ error: "Case not found" }, { status: 404 });
        }
        return jsonResponse({ case: detail });
      });
    },

    changeCaseStatus({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const caseId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        await service.changeCaseStatus({
          actorUserId: admin.authUserId,
          caseId,
          input: await jsonBody(request),
        });
        return jsonResponse({ ok: true });
      });
    },

    createMatch({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const caseId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        const match = await service.createMatch({
          actorUserId: admin.authUserId,
          caseId,
          input: await jsonBody(request),
        });
        return jsonResponse({ match }, { status: 201 });
      });
    },

    createFollowup({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const caseId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        const followup = await service.createFollowup({
          actorUserId: admin.authUserId,
          caseId,
          input: await jsonBody(request),
        });
        return jsonResponse({ followup }, { status: 201 });
      });
    },

    finalizeAdoption({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const caseId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        const adoption = await service.finalizeAdoption({
          actorUserId: admin.authUserId,
          caseId,
          input: await jsonBody(request),
        });
        return jsonResponse({ adoption }, { status: 201 });
      });
    },
  };
}
