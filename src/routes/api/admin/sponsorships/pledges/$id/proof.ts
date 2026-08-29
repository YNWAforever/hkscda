import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { jsonResponse } from "../../../../../../lib/sponsorshipAdmin/http.server";
import { createHandlersWithContext } from "../-handlers";
import { handleRecordPaymentUpload } from "../-recordPaymentUpload";

const paramsSchema = z.object({ id: z.string().uuid() });

async function recordPayment({ request, params }: { request: Request; params: { id: string } }) {
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return jsonResponse({ error: "Invalid id" }, { status: 400 });
  }

  const { client, service, requireCoordinator } = createHandlersWithContext();

  return handleRecordPaymentUpload({
    request,
    pledgeId: parsedParams.data.id,
    client,
    service,
    requireCoordinator,
  });
}

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/proof")({
  server: {
    handlers: {
      POST: ({ request, params }) => recordPayment({ request, params }),
    },
  },
});
