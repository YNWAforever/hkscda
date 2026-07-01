import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { createAdoptionCoordinatorService } from "./service";

type AdoptionCoordinatorService = ReturnType<typeof createAdoptionCoordinatorService>;

type HandlerContext = {
  request: Request;
  params?: Record<string, string | undefined>;
};

type CreateAdoptionCoordinatorHandlersArgs = {
  requireCoordinator: (request: Request) => Promise<AdminUser>;
  requireStatusAdmin: (request: Request) => Promise<AdminUser>;
  service: AdoptionCoordinatorService;
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
}

function requiredUuid(params: HandlerContext["params"], key: string) {
  const value = params?.[key];
  if (!value || !z.string().uuid().safeParse(value).success) {
    throw jsonResponse({ error: `Invalid ${key}` }, { status: 400 });
  }
  return value;
}

const badRequestDomainErrors = new Set([
  "Invalid case status",
  "Inactive case status",
  "Invalid match status",
  "Inactive match status",
  "Invalid followup status",
  "Inactive followup status",
  "Invalid coordinator task links",
  "Completed tasks require a completed date",
  "Completed tasks require an outcome or remarks",
  "Cancelled tasks require an outcome or remarks",
  "Invalid adoption outcome status",
  "Inactive adoption outcome status",
  "Invalid successful adoption outcome status",
  "Adopter filters match too many records",
  "Invalid manual intake identity",
  "Unsupported coordinator export audit",
]);

const notFoundDomainErrors = new Set([
  "Status not found",
  "Task not found",
  "Adoption case not found",
  "Adopter profile not found",
  "Supporter not found",
  "Export audit not found",
  "Match not found for adoption case",
]);

const conflictDomainErrors = new Set([
  "System statuses cannot be deleted",
  "System status keys cannot be changed",
  "System status categories cannot be changed",
  "Match must be approved before finalization",
  "Adoption case is missing adopter profile",
  "Adoption case is missing supporter",
  "Approved match has no animal",
]);

async function responseError(error: Response) {
  const status = error.status;
  const contentType = error.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = await error.clone().json();
      if (body && typeof body === "object") {
        return jsonResponse(body, { status });
      }
    } catch {
      // Fall through to text/status normalization.
    }
  }

  let message = "";
  try {
    message = (await error.clone().text()).trim();
  } catch {
    message = "";
  }

  return jsonResponse({ error: message || error.statusText || "Request failed" }, { status });
}

function domainError(error: Error) {
  const normalizedMessage = error.message.toLowerCase();

  if (notFoundDomainErrors.has(error.message)) {
    return jsonResponse({ error: error.message }, { status: 404 });
  }
  if (
    conflictDomainErrors.has(error.message) ||
    (normalizedMessage.includes("protected") &&
      (normalizedMessage.includes("status") ||
        normalizedMessage.includes("delete") ||
        normalizedMessage.includes("mutation")))
  ) {
    return jsonResponse({ error: error.message }, { status: 409 });
  }
  if (badRequestDomainErrors.has(error.message)) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }

  return null;
}

async function withErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return responseError(error);
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid coordinator request" }, { status: 400 });
    }
    if (error instanceof Error) {
      const response = domainError(error);
      if (response) return response;
    }

    console.error(error);
    return jsonResponse({ error: "Could not process coordinator request" }, { status: 500 });
  }
}

export function createAdoptionCoordinatorHandlers({
  requireCoordinator,
  requireStatusAdmin,
  service,
}: CreateAdoptionCoordinatorHandlersArgs) {
  return {
    listStatuses({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const category = new URL(request.url).searchParams.get("category") ?? undefined;
        return jsonResponse({ statuses: await service.listStatuses(category) });
      });
    },

    createStatus({ request }: HandlerContext) {
      return withErrors(async () => {
        const admin = await requireStatusAdmin(request);
        const status = await service.createStatus({
          actorUserId: admin.authUserId,
          input: await jsonBody(request),
        });
        return jsonResponse({ status }, { status: 201 });
      });
    },

    getStatus({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const statusId = requiredUuid(params, "id");
        await requireCoordinator(request);
        const status = await service.getStatus(statusId);
        if (!status) {
          return jsonResponse({ error: "Status not found" }, { status: 404 });
        }
        return jsonResponse({ status });
      });
    },

    updateStatus({ request, params }: HandlerContext) {
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
    },

    deleteStatus({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const statusId = requiredUuid(params, "id");
        const admin = await requireStatusAdmin(request);
        await service.deleteStatus({ actorUserId: admin.authUserId, statusId });
        return jsonResponse({ ok: true });
      });
    },

    listCases({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = Object.fromEntries(new URL(request.url).searchParams);
        return jsonResponse(await service.listCases(search));
      });
    },

    listIntakeItems({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = Object.fromEntries(new URL(request.url).searchParams);
        return jsonResponse(await service.listIntakeItems(search));
      });
    },

    listTasks({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = Object.fromEntries(new URL(request.url).searchParams);
        return jsonResponse(await service.listTasks(search));
      });
    },

    listAdopters({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = Object.fromEntries(new URL(request.url).searchParams);
        return jsonResponse(await service.listAdopters(search));
      });
    },

    searchManualCaseIdentity({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = Object.fromEntries(new URL(request.url).searchParams);
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

    listCoordinatorExportHistory({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = Object.fromEntries(new URL(request.url).searchParams);
        return jsonResponse(await service.listCoordinatorExportHistory(search));
      });
    },

    getCoordinatorMonthlySummary({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = Object.fromEntries(new URL(request.url).searchParams);
        return jsonResponse({ summary: await service.getCoordinatorMonthlySummary(search) });
      });
    },

    exportCoordinatorCsv({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const admin = await requireCoordinator(request);
        const result = await service.exportCoordinatorCsv({
          actorUserId: admin.authUserId,
          kind: params?.kind,
          rawSearch: Object.fromEntries(new URL(request.url).searchParams),
        });
        return csvResponse(result.csv, result.filename);
      });
    },

    regenerateCoordinatorExport({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const auditLogId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        const result = await service.regenerateCoordinatorExport({
          actorUserId: admin.authUserId,
          auditLogId,
        });
        return csvResponse(result.csv, result.filename);
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
