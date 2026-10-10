import { createElement } from "react";

import type { SupporterTimelineItem, SupporterTimelineKind } from "../../../lib/crm/types";
import type { AdminLanguage } from "../i18n/copy";
import { pickAdminCopy } from "../i18n/copy";
import { timelineCopy } from "./copy";

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

type SupporterTimelineFiltersProps = {
  language: AdminLanguage;
  value: TimelineFilter;
  onChange: (value: TimelineFilter) => void;
};

export function SupporterTimelineFilters({
  language,
  value,
  onChange,
}: SupporterTimelineFiltersProps) {
  const copy = pickAdminCopy(timelineCopy, language);

  return createElement(
    "div",
    {
      className:
        "grid w-full grid-cols-2 gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] p-1 sm:w-auto sm:grid-cols-4 xl:grid-cols-7",
      role: "group",
      "aria-label": copy.filtersLabel,
    },
    timelineFilterOptions.map((option) => {
      const selected = option.id === value;

      return createElement(
        "button",
        {
          key: option.id,
          type: "button",
          className: [
            "min-h-9 min-w-24 rounded-md px-3 text-xs font-medium transition-colors",
            selected
              ? "bg-[var(--color-surface)] text-[var(--color-panel)] shadow-sm"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-panel)]",
          ].join(" "),
          "aria-pressed": selected,
          onClick: () => onChange(option.id),
        },
        copy.filters[option.labelKey],
      );
    }),
  );
}
