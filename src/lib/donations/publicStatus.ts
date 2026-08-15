export const publicDonationStatuses = ["pending", "succeeded", "failed", "refunded"] as const;

export type PublicDonationStatus = (typeof publicDonationStatuses)[number];

export type PublicDonationStatusResponse = {
  status: PublicDonationStatus;
};

export type PublicDonationStatusLoader = (
  donationId: string,
) => Promise<PublicDonationStatusResponse>;

export type PollDonationSucceededOptions = {
  attempts?: number;
  delayMs?: number;
  load?: PublicDonationStatusLoader;
};

const maxAttempts = 90;
const defaultDelayMs = 10_000;

export const pollDonationDefaults = {
  attempts: maxAttempts,
  delayMs: defaultDelayMs,
} as const;

function isPublicDonationStatus(value: unknown): value is PublicDonationStatus {
  return (
    typeof value === "string" && publicDonationStatuses.includes(value as PublicDonationStatus)
  );
}

async function loadDonationStatus(donationId: string): Promise<PublicDonationStatusResponse> {
  const response = await fetch(`/api/donations/${encodeURIComponent(donationId)}/status`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Donation status request failed: ${response.status}`);

  const body = (await response.json()) as { status?: unknown };
  if (!isPublicDonationStatus(body.status)) throw new Error("Invalid donation status response");
  return { status: body.status };
}

export async function pollDonationSucceeded(
  donationId: string,
  options: PollDonationSucceededOptions = {},
): Promise<boolean> {
  const attempts = Math.min(maxAttempts, Math.max(1, Math.floor(options.attempts ?? maxAttempts)));
  const delayMs = Math.max(0, options.delayMs ?? defaultDelayMs);
  const load = options.load ?? loadDonationStatus;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await load(donationId);
      if (result.status === "succeeded") return true;
      if (result.status === "failed" || result.status === "refunded") return false;
    } catch {
      return false;
    }

    if (attempt < attempts - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}
