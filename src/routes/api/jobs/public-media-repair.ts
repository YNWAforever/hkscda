import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createSupabaseAnimalPublicationMediaRepairPort,
  repairAnimalPublicationMedia,
} from "../../../lib/animals/publicationMediaRepair.server";
import {
  createSupabaseContentPublicationMediaRepairPort,
  repairContentPublicationMedia,
} from "../../../lib/content/publicationMediaRepair.server";
import {
  createSupabaseContentPublicationMediaWithdrawalPort,
  withdrawContentPublicationMedia,
} from "../../../lib/content/publicationMediaWithdrawal.server";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import { authorizedCron } from "../../../lib/volunteers/jobs/auth.server";

type Dependencies = {
  secret: () => string | undefined;
  createClient: typeof createSupabaseServiceClient;
  runAnimal(client: SupabaseClient): ReturnType<typeof repairAnimalPublicationMedia>;
  runContent(client: SupabaseClient): ReturnType<typeof repairContentPublicationMedia>;
  runContentWithdrawal(client: SupabaseClient): ReturnType<typeof withdrawContentPublicationMedia>;
  logger: Pick<Console, "error">;
};

export function createPublicMediaRepairHandler({
  secret = () => process.env.CRON_SECRET,
  createClient = createSupabaseServiceClient,
  runAnimal = (client) =>
    repairAnimalPublicationMedia(createSupabaseAnimalPublicationMediaRepairPort(client)),
  runContent = (client) =>
    repairContentPublicationMedia(createSupabaseContentPublicationMediaRepairPort(client)),
  // BUG-72: the same daily run deletes public copies a story no longer uses.
  runContentWithdrawal = (client) =>
    withdrawContentPublicationMedia(createSupabaseContentPublicationMediaWithdrawalPort(client)),
  logger = console,
}: Partial<Dependencies> = {}) {
  return async (request: Request): Promise<Response> => {
    if (!authorizedCron(request, secret())) {
      return Response.json(
        { error: "unauthorized" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    const client = createClient();
    const [animal, content, contentWithdrawal] = await Promise.allSettled([
      runAnimal(client),
      runContent(client),
      runContentWithdrawal(client),
    ]);
    if (animal.status === "rejected") logger.error("Animal media repair failed", animal.reason);
    if (content.status === "rejected") logger.error("Content media repair failed", content.reason);
    if (contentWithdrawal.status === "rejected")
      logger.error("Content media withdrawal failed", contentWithdrawal.reason);
    const failed = [animal, content, contentWithdrawal].some(
      (result) => result.status === "rejected" || result.value.failed > 0,
    );
    return Response.json(
      {
        animal: animal.status === "fulfilled" ? animal.value : null,
        content: content.status === "fulfilled" ? content.value : null,
        contentWithdrawal:
          contentWithdrawal.status === "fulfilled" ? contentWithdrawal.value : null,
      },
      { status: failed ? 500 : 200, headers: { "cache-control": "no-store" } },
    );
  };
}

const handleRepair = createPublicMediaRepairHandler();
export const Route = createFileRoute("/api/jobs/public-media-repair")({
  server: {
    handlers: {
      GET: ({ request }) => handleRepair(request),
    },
  },
});
