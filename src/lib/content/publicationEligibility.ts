export type ContentClassification = "unreviewed" | "verified" | "demo";
export type PublicationSurface = "listing" | "detail" | "promotion";

export type PublicationEligibilityRecord = {
  status: string;
  type: string;
  contentClass?: ContentClassification | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
};

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function publicContentState(
  record: PublicationEligibilityRecord,
  now: Date,
): "upcoming" | "active" | "ended" {
  const start = timestamp(record.effectiveFrom);
  const end = timestamp(record.effectiveUntil);
  if (start !== null && start > now.getTime()) return "upcoming";
  if (end !== null && end < now.getTime()) return "ended";
  return "active";
}

export function isPubliclyEligibleContent(
  record: PublicationEligibilityRecord,
  now: Date,
  surface: PublicationSurface = "listing",
): boolean {
  if (record.status !== "published") return false;
  if (record.contentClass && !["unreviewed", "verified"].includes(record.contentClass))
    return false;
  const start = timestamp(record.effectiveFrom);
  const end = timestamp(record.effectiveUntil);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  if (start !== null && start > now.getTime()) return false;
  if (end === null || end >= now.getTime()) return true;
  if (surface === "detail") return true;
  return surface === "listing" && (record.type === "event" || record.type === "charity_market");
}
