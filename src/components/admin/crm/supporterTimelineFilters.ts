import { createElement } from "react";

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

type SupporterTimelineFiltersProps = {
  language: "zh" | "en";
  value: TimelineFilter;
  onChange: (value: TimelineFilter) => void;
};

const filterCopy = {
  zh: {
    all: "全部",
    donations: "捐款",
    receipts: "收據",
    communication: "通訊",
    adoption: "領養",
    followups: "跟進",
    system: "系統",
  },
  en: {
    all: "All",
    donations: "Donations",
    receipts: "Receipts",
    communication: "Communication",
    adoption: "Adoption",
    followups: "Follow-ups",
    system: "System",
  },
} as const;

export function SupporterTimelineFilters({
  language,
  value,
  onChange,
}: SupporterTimelineFiltersProps) {
  const copy = filterCopy[language];

  return createElement(
    "div",
    {
      className:
        "grid w-full grid-cols-2 gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] p-1 sm:w-auto sm:grid-cols-4 xl:grid-cols-7",
      role: "group",
      "aria-label": language === "zh" ? "時間軸篩選" : "Timeline filters",
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
        copy[option.labelKey],
      );
    }),
  );
}
