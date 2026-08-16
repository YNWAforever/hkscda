import { z } from "zod";

import { publicDonationStatuses, type PublicDonationStatus } from "./publicStatus";

export type PublicDonationStatusRepository = {
  refreshPendingCod?: (donationId: string) => Promise<unknown>;
  findStatus: (donationId: string) => Promise<PublicDonationStatus | null>;
};

export type PublicDonationStatusResult = {
  status: PublicDonationStatus;
};

const donationIdSchema = z.string().uuid();

export async function loadPublicDonationStatus({
  donationId,
  repository,
}: {
  donationId: string;
  repository: PublicDonationStatusRepository;
}): Promise<PublicDonationStatusResult | null> {
  if (!donationIdSchema.safeParse(donationId).success) return null;

  let refreshFailed = false;
  try {
    await repository.refreshPendingCod?.(donationId);
  } catch {
    // Refresh is best-effort. A provider or database timeout must not invent a
    // terminal state or hide the last locally committed donation status.
    refreshFailed = true;
  }

  const status = await repository.findStatus(donationId);
  if (!status || !publicDonationStatuses.includes(status)) return null;
  // If COD reconciliation committed success but receipt/acknowledgement work is
  // still failing, keep the donor polling. The next request re-enters the
  // idempotent recovery path instead of stranding the lifecycle.
  if (refreshFailed && status === "succeeded") return { status: "pending" };
  return { status };
}
