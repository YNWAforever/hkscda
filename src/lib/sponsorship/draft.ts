import { pickDraftFields } from "../forms/localDraft";

export const SPONSORSHIP_PLEDGE_DRAFT_STORAGE_KEY = "hkscda-sponsorship-pledge-draft-v1";

export function pickSponsorshipDraftData(value: unknown): Record<string, unknown> {
  const picked = pickDraftFields(value, [
    "monthlyTier",
    "customAmount",
    "supporterName",
    "email",
    "phone",
    "notes",
  ]);
  if (!["100", "300", "500", "custom"].includes(String(picked.monthlyTier))) {
    delete picked.monthlyTier;
  }
  return picked;
}
