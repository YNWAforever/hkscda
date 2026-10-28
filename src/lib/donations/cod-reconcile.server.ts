import { deliverDonationPayment, type DonationDeliveryWorker } from "./deliveryJobs.server";
import { reconcileProviderPayment, type ReconcileProviderArgs } from "./reconcile.server";

// COD settlement still uses the shared money/event lifecycle. Its receipt and
// acknowledgement attempt uses the same durable job as cron and finance retry.
export function reconcileCodPayment(args: ReconcileProviderArgs, worker?: DonationDeliveryWorker) {
  return reconcileProviderPayment(args, {
    deliver: (paymentId) => deliverDonationPayment(args.client, paymentId, worker),
  });
}
