import { describe, expect, test } from "bun:test";

import type { SupporterTimelineKind } from "../../../lib/crm/types";
import { filterTimelineItems, timelineFilterOptions, type TimelineFilter } from "./supporterTimelineFilters";

function item(kind: SupporterTimelineKind) {
  return {
    id: kind,
    at: "2026-06-01T10:00:00.000Z",
    kind,
    title: kind,
    description: kind,
  };
}

describe("supporter timeline filters", () => {
  test("groups timeline kinds into staff-facing filter buckets", () => {
    const items = [
      item("donation"),
      item("payment"),
      item("receipt"),
      item("consent"),
      item("message"),
      item("adoption_case"),
      item("successful_adoption"),
      item("adoption_followup"),
      item("audit"),
    ];

    const idsByFilter = Object.fromEntries(
      (["all", "donations", "receipts", "communication", "adoption", "followups", "system"] satisfies TimelineFilter[]).map(
        (filter) => [filter, filterTimelineItems(items, filter).map((row) => row.kind)],
      ),
    );

    expect(idsByFilter.all).toHaveLength(9);
    expect(idsByFilter.donations).toEqual(["donation", "payment"]);
    expect(idsByFilter.receipts).toEqual(["receipt"]);
    expect(idsByFilter.communication).toEqual(["consent", "message"]);
    expect(idsByFilter.adoption).toEqual(["adoption_case", "successful_adoption"]);
    expect(idsByFilter.followups).toEqual(["adoption_followup"]);
    expect(idsByFilter.system).toEqual(["audit"]);
  });

  test("keeps a stable option order for the segmented control", () => {
    expect(timelineFilterOptions.map((option) => option.id)).toEqual([
      "all",
      "donations",
      "receipts",
      "communication",
      "adoption",
      "followups",
      "system",
    ]);
  });
});
