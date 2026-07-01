import { createHash, randomBytes } from "node:crypto";

export const STATUS_TOKEN_DAYS = 30;

export function hashStatusToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function createStatusTokenPair(random = randomBytes) {
  const rawToken = random(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashStatusToken(rawToken),
  };
}

export function statusTokenExpiry(now = () => new Date()) {
  const expiresAt = now();
  expiresAt.setDate(expiresAt.getDate() + STATUS_TOKEN_DAYS);
  return expiresAt.toISOString();
}

export function isTokenExpired(expiresAt: string, now = new Date()) {
  return new Date(expiresAt).getTime() <= now.getTime();
}

type PublicStatusSummaryInput = {
  application: {
    id: string;
    created_at: string;
    applicant_name: string;
    email: string;
    phone: string;
  };
  preferences: Array<{
    rank: number;
    animal_name_snapshot: string;
    animal_type_snapshot: string;
  }>;
  visit: {
    date_range_start: string;
    date_range_end: string;
    preferred_time_windows: string[];
    notes: string | null;
  } | null;
  token: { expires_at: string };
};

export function applicationReference(id: string) {
  return `APP-${id.slice(0, 8).toUpperCase()}`;
}

export function buildPublicStatusSummary(input: PublicStatusSummaryInput) {
  return {
    reference: applicationReference(input.application.id),
    submittedAt: input.application.created_at,
    applicantName: input.application.applicant_name,
    contactSummary: `${input.application.email} · ${input.application.phone}`,
    rankedAnimals: [...input.preferences]
      .sort((left, right) => left.rank - right.rank)
      .map((preference) => ({
        rank: preference.rank,
        name: preference.animal_name_snapshot,
        type: preference.animal_type_snapshot,
      })),
    visitPreference: input.visit
      ? {
          dateRangeStart: input.visit.date_range_start,
          dateRangeEnd: input.visit.date_range_end,
          preferredTimeWindows: input.visit.preferred_time_windows,
          notes: input.visit.notes,
        }
      : null,
    expiresAt: input.token.expires_at,
  };
}
