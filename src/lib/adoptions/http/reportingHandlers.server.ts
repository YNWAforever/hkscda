import { csvResponse, jsonResponse, queryParams, requiredUuid, withErrors } from "./shared.server";
import type {
  AdoptionCoordinatorService,
  CoordinatorAuthorizer,
  HandlerContext,
} from "./shared.server";

export type ReportingService = Pick<
  AdoptionCoordinatorService,
  | "listCoordinatorExportHistory"
  | "getCoordinatorMonthlySummary"
  | "exportCoordinatorCsv"
  | "regenerateCoordinatorExport"
>;

export function createReportingHandlers({
  requireCoordinator,
  service,
}: {
  requireCoordinator: CoordinatorAuthorizer;
  service: ReportingService;
}): {
  listCoordinatorExportHistory(context: HandlerContext): Promise<Response>;
  getCoordinatorMonthlySummary(context: HandlerContext): Promise<Response>;
  exportCoordinatorCsv(context: HandlerContext): Promise<Response>;
  regenerateCoordinatorExport(context: HandlerContext): Promise<Response>;
} {
  return {
    listCoordinatorExportHistory({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = queryParams(request);
        return jsonResponse(await service.listCoordinatorExportHistory(search));
      });
    },

    getCoordinatorMonthlySummary({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = queryParams(request);
        return jsonResponse({ summary: await service.getCoordinatorMonthlySummary(search) });
      });
    },

    exportCoordinatorCsv({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const admin = await requireCoordinator(request);
        const result = await service.exportCoordinatorCsv({
          actorUserId: admin.authUserId,
          kind: params?.kind,
          rawSearch: queryParams(request),
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
  };
}
