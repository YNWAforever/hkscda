import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { createCrmService } from "./service";

type CrmService = ReturnType<typeof createCrmService>;

type HandlerContext = {
  request: Request;
  params?: Record<string, string | undefined>;
};

type CreateCrmHandlersArgs = {
  requireTreasurer: (request: Request) => Promise<AdminUser>;
  service: CrmService;
};

function searchParams(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams);
}

async function jsonBody(request: Request) {
  return request.json();
}

function csvResponse(csv: string, filename: "supporters.csv" | "donations.csv") {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

async function withCrmErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid CRM request" }, { status: 400 });
    }

    console.error(error);
    return Response.json({ error: "Could not process CRM request" }, { status: 500 });
  }
}

function requiredId(params: HandlerContext["params"]) {
  const id = params?.id;
  if (!id) {
    throw new Response("Missing supporter id", { status: 400 });
  }
  return id;
}

export function createCrmHandlers({ requireTreasurer, service }: CreateCrmHandlersArgs) {
  return {
    listSupporters({ request }: HandlerContext) {
      return withCrmErrors(async () => {
        await requireTreasurer(request);
        return Response.json(await service.listSupporters(searchParams(request)));
      });
    },

    createSupporter({ request }: HandlerContext) {
      return withCrmErrors(async () => {
        const admin = await requireTreasurer(request);
        return Response.json(
          await service.createSupporter({
            actorUserId: admin.authUserId,
            input: await jsonBody(request),
          }),
          { status: 201 },
        );
      });
    },

    getSupporter({ request, params }: HandlerContext) {
      return withCrmErrors(async () => {
        await requireTreasurer(request);
        const supporter = await service.getSupporterDetail(requiredId(params));
        if (!supporter) {
          return Response.json({ error: "Supporter not found" }, { status: 404 });
        }
        return Response.json({ supporter });
      });
    },

    updateSupporter({ request, params }: HandlerContext) {
      return withCrmErrors(async () => {
        const admin = await requireTreasurer(request);
        await service.updateSupporter({
          actorUserId: admin.authUserId,
          supporterId: requiredId(params),
          input: await jsonBody(request),
        });
        return Response.json({ ok: true });
      });
    },

    appendConsents({ request, params }: HandlerContext) {
      return withCrmErrors(async () => {
        const admin = await requireTreasurer(request);
        return Response.json(
          await service.appendConsents({
            actorUserId: admin.authUserId,
            supporterId: requiredId(params),
            input: await jsonBody(request),
          }),
          { status: 201 },
        );
      });
    },

    createManualDonation({ request }: HandlerContext) {
      return withCrmErrors(async () => {
        const admin = await requireTreasurer(request);
        return Response.json(
          await service.createManualDonation({
            actorUserId: admin.authUserId,
            input: await jsonBody(request),
          }),
          { status: 201 },
        );
      });
    },

    exportSupporters({ request }: HandlerContext) {
      return withCrmErrors(async () => {
        const admin = await requireTreasurer(request);
        return csvResponse(
          await service.exportSupporters({
            actorUserId: admin.authUserId,
            rawSearch: searchParams(request),
          }),
          "supporters.csv",
        );
      });
    },

    exportDonations({ request }: HandlerContext) {
      return withCrmErrors(async () => {
        const admin = await requireTreasurer(request);
        return csvResponse(
          await service.exportDonations({
            actorUserId: admin.authUserId,
            rawSearch: searchParams(request),
          }),
          "donations.csv",
        );
      });
    },
  };
}
