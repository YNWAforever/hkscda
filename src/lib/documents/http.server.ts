import { z } from "zod";

import { DocumentConflictError } from "./service";

type DocumentAdmin = { authUserId: string };
type HandlerContext = {
  request: Request;
  params?: Record<string, string | undefined>;
};
type DocumentHandlerService = {
  listAssets(input: unknown): Promise<unknown>;
  createAsset(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  updateAsset(input: { actorUserId: string; assetId: string; input: unknown }): Promise<unknown>;
  publishAsset(input: { actorUserId: string; assetId: string }): Promise<unknown>;
  unpublishAsset(input: { actorUserId: string; assetId: string }): Promise<unknown>;
  deleteAsset(input: { actorUserId: string; assetId: string }): Promise<unknown>;
  createUploadTarget(input: unknown): Promise<unknown>;
  listAnnualReports(): Promise<unknown>;
  createAnnualReport(input: { actorUserId: string; input: unknown }): Promise<unknown>;
  updateAnnualReport(input: {
    actorUserId: string;
    reportId: string;
    input: unknown;
  }): Promise<unknown>;
  publishAnnualReport(input: { actorUserId: string; reportId: string }): Promise<unknown>;
  unpublishAnnualReport(input: { actorUserId: string; reportId: string }): Promise<unknown>;
  deleteAnnualReport(input: { actorUserId: string; reportId: string }): Promise<unknown>;
};

type CreateDocumentHandlersArgs = {
  requireDocumentAdmin(request: Request): Promise<DocumentAdmin>;
  service: DocumentHandlerService;
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
}

function searchParams(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams);
}

function requiredId(params: HandlerContext["params"]) {
  const id = params?.id;
  if (!id) throw jsonResponse({ error: "Invalid document id" }, { status: 400 });
  return id;
}

async function withDocumentErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) {
      const text = await error.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = {
          error:
            text ||
            (error.status === 401
              ? "Unauthorized"
              : error.status === 403
                ? "Forbidden"
                : "Document request failed"),
        };
      }
      return jsonResponse(body, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return jsonResponse(
        {
          error: "Invalid document request",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    if (error instanceof DocumentConflictError) {
      return jsonResponse({ error: error.message }, { status: 409 });
    }

    console.error(error);
    return jsonResponse({ error: "Could not process document request" }, { status: 500 });
  }
}

export function createDocumentHandlers({
  requireDocumentAdmin,
  service,
}: CreateDocumentHandlersArgs) {
  return {
    listAssets({ request }: HandlerContext) {
      return withDocumentErrors(async () => {
        await requireDocumentAdmin(request);
        return jsonResponse(await service.listAssets(searchParams(request)));
      });
    },

    createAsset({ request }: HandlerContext) {
      return withDocumentErrors(async () => {
        const admin = await requireDocumentAdmin(request);
        const asset = await service.createAsset({
          actorUserId: admin.authUserId,
          input: await jsonBody(request),
        });
        return jsonResponse({ asset }, { status: 201 });
      });
    },

    updateAsset({ request, params }: HandlerContext) {
      return withDocumentErrors(async () => {
        const admin = await requireDocumentAdmin(request);
        const asset = await service.updateAsset({
          actorUserId: admin.authUserId,
          assetId: requiredId(params),
          input: await jsonBody(request),
        });
        return jsonResponse({ asset });
      });
    },

    publishAsset({ request, params }: HandlerContext) {
      return withDocumentErrors(async () => {
        const admin = await requireDocumentAdmin(request);
        const asset = await service.publishAsset({
          actorUserId: admin.authUserId,
          assetId: requiredId(params),
        });
        return jsonResponse({ asset });
      });
    },

    unpublishAsset({ request, params }: HandlerContext) {
      return withDocumentErrors(async () => {
        const admin = await requireDocumentAdmin(request);
        const asset = await service.unpublishAsset({
          actorUserId: admin.authUserId,
          assetId: requiredId(params),
        });
        return jsonResponse({ asset });
      });
    },

    deleteAsset({ request, params }: HandlerContext) {
      return withDocumentErrors(async () => {
        const admin = await requireDocumentAdmin(request);
        await service.deleteAsset({
          actorUserId: admin.authUserId,
          assetId: requiredId(params),
        });
        return jsonResponse({ ok: true });
      });
    },

    createUploadTarget({ request }: HandlerContext) {
      return withDocumentErrors(async () => {
        await requireDocumentAdmin(request);
        return jsonResponse(await service.createUploadTarget(await jsonBody(request)), {
          status: 201,
        });
      });
    },
    listAnnualReports({ request }: HandlerContext) {
      return withDocumentErrors(async () => {
        await requireDocumentAdmin(request);
        return jsonResponse(await service.listAnnualReports());
      });
    },

    createAnnualReport({ request }: HandlerContext) {
      return withDocumentErrors(async () => {
        const admin = await requireDocumentAdmin(request);
        const report = await service.createAnnualReport({
          actorUserId: admin.authUserId,
          input: await jsonBody(request),
        });
        return jsonResponse({ report }, { status: 201 });
      });
    },

    updateAnnualReport({ request, params }: HandlerContext) {
      return withDocumentErrors(async () => {
        const admin = await requireDocumentAdmin(request);
        const report = await service.updateAnnualReport({
          actorUserId: admin.authUserId,
          reportId: requiredId(params),
          input: await jsonBody(request),
        });
        return jsonResponse({ report });
      });
    },

    publishAnnualReport({ request, params }: HandlerContext) {
      return withDocumentErrors(async () => {
        const admin = await requireDocumentAdmin(request);
        const report = await service.publishAnnualReport({
          actorUserId: admin.authUserId,
          reportId: requiredId(params),
        });
        return jsonResponse({ report });
      });
    },

    unpublishAnnualReport({ request, params }: HandlerContext) {
      return withDocumentErrors(async () => {
        const admin = await requireDocumentAdmin(request);
        const report = await service.unpublishAnnualReport({
          actorUserId: admin.authUserId,
          reportId: requiredId(params),
        });
        return jsonResponse({ report });
      });
    },

    deleteAnnualReport({ request, params }: HandlerContext) {
      return withDocumentErrors(async () => {
        const admin = await requireDocumentAdmin(request);
        await service.deleteAnnualReport({
          actorUserId: admin.authUserId,
          reportId: requiredId(params),
        });
        return jsonResponse({ ok: true });
      });
    },
  };
}
