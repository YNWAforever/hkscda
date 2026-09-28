export type DeliveryWorklistJob = {
  id: string;
  paymentId: string;
  status: "retryable" | "attention_required";
  attempts: number;
  errorCode: string | null;
  createdAt: string;
  nextAttemptAt: string | null;
  paymentStatus: string;
  donationStatus: string;
};

export type DeliveryWorklistResult = {
  jobs: DeliveryWorklistJob[];
  total: number;
  page: number;
  pageSize: 25;
};
