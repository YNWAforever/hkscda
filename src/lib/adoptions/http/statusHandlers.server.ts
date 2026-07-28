import { jsonBody, jsonResponse, requiredUuid, withErrors } from "./shared.server";
import type {
  AdoptionCoordinatorService,
  CoordinatorAuthorizer,
  HandlerContext,
} from "./shared.server";

export type StatusService = Pick<
  AdoptionCoordinatorService,
  "listStatuses" | "getStatus" | "createStatus" | "updateStatus" | "deleteStatus"
>;

export function createStatusHandlers(deps: {
  requireCoordinator: CoordinatorAuthorizer;
  requireStatusAdmin: CoordinatorAuthorizer;
  service: StatusService;
}) {
  const { requireCoordinator, requireStatusAdmin, service } = deps;

  function listStatuses({ request }: HandlerContext) {
    return withErrors(async () => {
      await requireCoordinator(request);
      const category = new URL(request.url).searchParams.get("category") ?? undefined;
      return jsonResponse({ statuses: await service.listStatuses(category) });
    });
  }

  function createStatus({ request }: HandlerContext) {
    return withErrors(async () => {
      const admin = await requireStatusAdmin(request);
      const status = await service.createStatus({
        actorUserId: admin.authUserId,
        input: await jsonBody(request),
      });
      return jsonResponse({ status }, { status: 201 });
    });
  }

  function getStatus({ request, params }: HandlerContext) {
    return withErrors(async () => {
      const statusId = requiredUuid(params, "id");
      await requireCoordinator(request);
      const status = await service.getStatus(statusId);
      if (!status) {
        return jsonResponse({ error: "Status not found" }, { status: 404 });
      }
      return jsonResponse({ status });
    });
  }

  function updateStatus({ request, params }: HandlerContext) {
    return withErrors(async () => {
      const statusId = requiredUuid(params, "id");
      const admin = await requireStatusAdmin(request);
      const status = await service.updateStatus({
        actorUserId: admin.authUserId,
        statusId,
        input: await jsonBody(request),
      });
      return jsonResponse({ status });
    });
  }

  function deleteStatus({ request, params }: HandlerContext) {
    return withErrors(async () => {
      const statusId = requiredUuid(params, "id");
      const admin = await requireStatusAdmin(request);
      await service.deleteStatus({ actorUserId: admin.authUserId, statusId });
      return jsonResponse({ ok: true });
    });
  }

  return {
    listStatuses,
    createStatus,
    getStatus,
    updateStatus,
    deleteStatus,
  };
}
