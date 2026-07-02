import type { SponsorshipPledgeStatus } from "./schemas";

export function pledgeReference(pledgeId: string) {
  const compact = pledgeId.replaceAll("-", "").toUpperCase().padEnd(8, "0");
  return `SP-${compact.slice(0, 8)}`;
}

type PublicPledgeStatusSummaryInput = {
  pledge: {
    id: string;
    created_at: string;
    monthly_tier: "100" | "300" | "500" | "custom";
    amount_cents: number;
    status: SponsorshipPledgeStatus;
  };
  preferences: Array<{
    rank: number;
    animal_name_snapshot: string;
  }>;
  hasPaymentProof: boolean;
  token: { expires_at: string };
};

export function buildPublicPledgeStatusSummary(input: PublicPledgeStatusSummaryInput) {
  return {
    reference: pledgeReference(input.pledge.id),
    submittedAt: input.pledge.created_at,
    monthlyTier: input.pledge.monthly_tier,
    amountCents: input.pledge.amount_cents,
    status: input.pledge.status,
    rankedAnimals: [...input.preferences]
      .sort((left, right) => left.rank - right.rank)
      .map((preference) => ({
        rank: preference.rank,
        name: preference.animal_name_snapshot,
      })),
    hasPaymentProof: input.hasPaymentProof,
    expiresAt: input.token.expires_at,
  };
}
