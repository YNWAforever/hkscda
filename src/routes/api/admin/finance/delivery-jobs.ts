import { createFileRoute } from "@tanstack/react-router";

import { listDonationDeliveryWorklist } from "../../../../lib/donations/deliveryWorklist.server";
import type { DeliveryWorklistResult } from "../../../../lib/donations/deliveryWorklist";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

type Dependencies = {
  authorize: (request: Request) => Promise<string>;
  list: (actor: string, page: number) => Promise<DeliveryWorklistResult>;
};

export function createDeliveryWorklistHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "GET")
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    try {
      const actor = await deps.authorize(request);
      const rawPage = new URL(request.url).searchParams.get("page") ?? "1";
      if (!/^[1-9]\d{0,2}$/.test(rawPage) || Number(rawPage) > 1000)
        return Response.json({ error: "Invalid page" }, { status: 400, headers });
      return Response.json(await deps.list(actor, Number(rawPage)), { headers });
    } catch (error) {
      if (error instanceof Response && (error.status === 401 || error.status === 403))
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (code === "42501")
        return Response.json({ error: "Access denied" }, { status: 403, headers });
      if (code === "22023")
        return Response.json({ error: "Invalid page" }, { status: 400, headers });
      console.error("Delivery worklist unavailable");
      return Response.json({ error: "Delivery worklist unavailable" }, { status: 503, headers });
    }
  };
}

function liveHandler(request: Request) {
  const client = createSupabaseServiceClient();
  return createDeliveryWorklistHandler({
    authorize: async (input) =>
      (await requireAdmin(input, ["treasurer", "admin"], client)).authUserId,
    list: (actor, page) => listDonationDeliveryWorklist(client, actor, page),
  })(request);
}

export const Route = createFileRoute("/api/admin/finance/delivery-jobs")({
  server: { handlers: { GET: ({ request }) => liveHandler(request) } },
});
