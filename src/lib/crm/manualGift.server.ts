import type { ManualDonationInput } from "./schemas";

export type ManualGiftCommand = {
  requestId: string;
  actorUserId: string;
  input: Omit<ManualDonationInput, "requestId">;
};

export type ManualGiftResult = {
  donationId: string;
  paymentId: string;
  deliveryJobId: string | null;
  replayed: boolean;
};

export interface ManualGiftRepository {
  recordManualGift(command: ManualGiftCommand): Promise<ManualGiftResult>;
}
