import type { SupporterTimelineItem, SupporterTimelineKind } from "../../../lib/crm/types";

export const timelineFilterOptions = [
  { id: "all", labelKey: "all" },
  { id: "donations", labelKey: "donations" },
  { id: "receipts", labelKey: "receipts" },
  { id: "communication", labelKey: "communication" },
  { id: "adoption", labelKey: "adoption" },
  { id: "followups", labelKey: "followups" },
  { id: "system", labelKey: "system" },
] as const;

export type TimelineFilter = (typeof timelineFilterOptions)[number]["id"];

const filterKinds: Record<Exclude<TimelineFilter, "all">, SupporterTimelineKind[]> = {
  donations: ["donation", "payment"],
  receipts: ["receipt"],
  communication: ["consent", "message"],
  adoption: ["adoption_case", "successful_adoption"],
  followups: ["adoption_followup"],
  system: ["audit"],
};

export function filterTimelineItems(
  items: SupporterTimelineItem[],
  filter: TimelineFilter,
): SupporterTimelineItem[] {
  if (filter === "all") return items;
  const allowedKinds = new Set(filterKinds[filter]);
  return items.filter((item) => allowedKinds.has(item.kind));
}
