import { jsonBody, jsonResponse, queryParams, requiredUuid, withErrors } from "./shared.server";
import type {
  AdoptionCoordinatorService,
  CoordinatorAuthorizer,
  HandlerContext,
} from "./shared.server";

export type CaseService = Pick<
  AdoptionCoordinatorService,
  | "listCases"
  | "listIntakeItems"
  | "listAnimalPipeline"
  | "createManualCase"
  | "getCaseDetail"
  | "changeCaseStatus"
  | "createMatch"
  | "createFollowup"
  | "finalizeAdoption"
>;

export function createCaseHandlers({
  requireCoordinator,
  service,
}: {
  requireCoordinator: CoordinatorAuthorizer;
  service: CaseService;
}): {
  listCases(context: HandlerContext): Promise<Response>;
  listIntakeItems(context: HandlerContext): Promise<Response>;
  listAnimalPipeline(context: HandlerContext): Promise<Response>;
  createManualCase(context: HandlerContext): Promise<Response>;
  getCase(context: HandlerContext): Promise<Response>;
  changeCaseStatus(context: HandlerContext): Promise<Response>;
  createMatch(context: HandlerContext): Promise<Response>;
  createFollowup(context: HandlerContext): Promise<Response>;
  finalizeAdoption(context: HandlerContext): Promise<Response>;
} {
  return {
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
