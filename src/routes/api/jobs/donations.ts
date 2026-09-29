import { createFileRoute } from "@tanstack/react-router";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import {
  createDonationDeliveryHandler,
  createDonationDeliveryWorker,
  createSupabaseDeliveryJobRepository,
} from "../../../lib/donations/deliveryJobs.server";
import {
  createDonationDeliveryCron,
  dispatchDueDonationJobs,
} from "../../../lib/donations/deliveryScheduler.server";

export const Route = createFileRoute("/api/jobs/donations")({
  server: {
    handlers: {
      GET: ({ request }) =>
        createDonationDeliveryCron({
          secret: () => process.env.CRON_SECRET,
          run: async () => {
            const client = createSupabaseServiceClient();
            const repository = createSupabaseDeliveryJobRepository(client);
            const worker = createDonationDeliveryWorker({
              repository,
              deliver: createDonationDeliveryHandler(client),
            });
            return dispatchDueDonationJobs({ listDue: repository.listDue, run: worker.run });
          },
        })(request),
    },
  },
});
