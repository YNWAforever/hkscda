import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  buildSponsorshipReminderDraft,
  type ReminderPledge,
} from "../../../../../../lib/sponsorshipAdmin/reminderDraft";
import { createHandlersWithContext } from "../-handlers";

type Dependencies = {
  authorize: (request: Request) => Promise<void>;
  load: (pledgeId: string) => Promise<ReminderPledge | null>;
  now: () => Date;
};

export function createSponsorshipReminderDraftHandler(deps: Dependencies) {
  return async (request: Request, pledgeId: string): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "GET")
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    try {
      await deps.authorize(request);
      if (!z.string().uuid().safeParse(pledgeId).success)
        return Response.json({ error: "Invalid pledge" }, { status: 400, headers });
      const pledge = await deps.load(pledgeId);
      if (!pledge) return Response.json({ error: "Pledge not found" }, { status: 404, headers });
      return Response.json(buildSponsorshipReminderDraft(pledge, deps.now()), { headers });
    } catch (error) {
      if (error instanceof Response && (error.status === 401 || error.status === 403))
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      console.error("Sponsorship reminder draft unavailable");
      return Response.json({ error: "Draft unavailable" }, { status: 503, headers });
    }
  };
}

function liveHandler(request: Request, pledgeId: string) {
  const context = createHandlersWithContext();
  return createSponsorshipReminderDraftHandler({
    authorize: async (input) => {
      await context.requireCoordinator(input);
    },
    load: (id) => context.service.getPledgeDetail(id),
    now: () => new Date(),
  })(request, pledgeId);
}

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/reminder-draft")({
  server: {
    handlers: {
      GET: ({ request, params }) => liveHandler(request, params.id),
    },
  },
});
