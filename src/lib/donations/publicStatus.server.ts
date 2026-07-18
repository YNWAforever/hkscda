import { z } from "zod";

import { publicDonationStatuses, type PublicDonationStatus } from "./publicStatus";

export type PublicDonationStatusRepository = {
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

  const status = await repository.findStatus(donationId);
  if (!status || !publicDonationStatuses.includes(status)) return null;
  return { status };
}
