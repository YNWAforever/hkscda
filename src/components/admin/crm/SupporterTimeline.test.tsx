import { describe, expect, test } from "bun:test";

import type { SupporterTimelineItem } from "../../../lib/crm/types";
import { renderAdminInChinese, renderAdminInEnglish } from "../i18n/testing";
import { SupporterTimeline } from "./SupporterTimeline";

const items: SupporterTimelineItem[] = [
  {
    id: "t1",
    at: "2026-10-01T02:30:00Z",
    kind: "payment",
    title: "Payment",
    description: "Monthly gift",
    status: "succeeded",
  },
  {
    id: "t2",
    at: "2026-10-02T02:30:00Z",
    kind: "receipt",
    title: "Receipt",
    description: "Receipt 1",
    status: "pending",
  },
  {
    id: "t3",
    at: "2026-10-03T02:30:00Z",
    kind: "donation",
    title: "Gift",
    description: "No status",
  },
];

/** The text of every status pill: the span after its dot. */
function pillLabels(markup: string): string[] {
  return [...markup.matchAll(/aria-hidden="true"><\/span><span>([^<]*)<\/span>/g)].map((m) => m[1]);
}

describe("SupporterTimeline status pill", () => {
  test("shows a status in a pill, with the same Chinese wording as before", () => {
    expect(pillLabels(renderAdminInChinese(<SupporterTimeline items={items} />))).toEqual([
      "成功",
      "待處理",
    ]);
  });

  test("shows the English wording, and no pill for an item without a status", () => {
    expect(pillLabels(renderAdminInEnglish(<SupporterTimeline items={items} />))).toEqual([
      "Succeeded",
      "Pending",
    ]);
  });
});
