import {
  jsonBody,
  jsonResponse,
  queryParams,
  requiredUuid,
  withErrors,
} from "./shared.server";
import type {
  AdoptionCoordinatorService,
  CoordinatorAuthorizer,
  HandlerContext,
} from "./shared.server";

export type TaskService = Pick<
  AdoptionCoordinatorService,
  "listTasks" | "createTask" | "getTask" | "updateTask"
>;

export function createTaskHandlers({
  requireCoordinator,
  service,
}: {
  requireCoordinator: CoordinatorAuthorizer;
  service: TaskService;
}): {
  listTasks(context: HandlerContext): Promise<Response>;
  createTask(context: HandlerContext): Promise<Response>;
  getTask(context: HandlerContext): Promise<Response>;
  updateTask(context: HandlerContext): Promise<Response>;
} {
  return {
    listTasks({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = queryParams(request);
        return jsonResponse(await service.listTasks(search));
      });
    },

    createTask({ request }: HandlerContext) {
      return withErrors(async () => {
        const admin = await requireCoordinator(request);
        const task = await service.createTask({
          actorUserId: admin.authUserId,
          input: await jsonBody(request),
        });
        return jsonResponse({ task }, { status: 201 });
      });
    },

    getTask({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const taskId = requiredUuid(params, "id");
        await requireCoordinator(request);
        const task = await service.getTask(taskId);
        if (!task) {
          return jsonResponse({ error: "Task not found" }, { status: 404 });
        }
        return jsonResponse({ task });
      });
    },

    updateTask({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const taskId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        const task = await service.updateTask({
          actorUserId: admin.authUserId,
          taskId,
          input: await jsonBody(request),
        });
        return jsonResponse({ task });
      });
    },
  };
}
