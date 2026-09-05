import { createManualGiftDeliveryHandlers } from "./manualGiftDelivery.http.server";
import { createSupabaseCrmRepository } from "./repository.server";
import { createCrmService } from "./service";
import { createSupabaseServiceClient, requireAdmin } from "../donations/supabase.server";
import {
  createSupabaseDeliveryJobRepository,
  createDonationDeliveryWorker,
  createDonationDeliveryHandler,
} from "../donations/deliveryJobs.server";

export function createManualGiftDeliveryComposition() {
  const client = createSupabaseServiceClient();
  const repository = createSupabaseDeliveryJobRepository(client);
  const worker = createDonationDeliveryWorker({
    repository,
    deliver: createDonationDeliveryHandler(client),
  });
  const service = createCrmService({ repo: createSupabaseCrmRepository(client) });
  return createManualGiftDeliveryHandlers({
    requireTreasurer: (request) => requireAdmin(request, ["treasurer", "admin"], client),
    createGift: service.createManualDonation,
    run: worker.run,
    status: repository.status,
    retryJob: repository.retry,
  });
}
