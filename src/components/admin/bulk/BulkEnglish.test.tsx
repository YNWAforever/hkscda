import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";
import { BulkResults } from "./BulkResults";
import { BulkReview } from "./BulkReview";
import { bulkCopy } from "./copy";
import type { BulkItemResult } from "./bulkResultsCsv";

const FUTURE = "2099-09-28T01:00:00Z";
const PAST = "2000-01-01T00:00:00Z";

const mixed: BulkItemResult[] = [
  { entityId: "id-1", status: "pending", reasonCode: null, before: "old tag", after: "new tag" },
  { entityId: "id-2", status: "succeeded", reasonCode: null, before: "a", after: "b" },
  { entityId: "id-3", status: "skipped", reasonCode: "no_change", before: "a", after: "a" },
  { entityId: "id-4", status: "conflict", reasonCode: "version_changed", before: "a", after: "b" },
  { entityId: "id-5", status: "failed", reasonCode: "not_found", before: "a", after: "b" },
];

function review(props: Partial<Parameters<typeof BulkReview>[0]> = {}) {
  return (
    <BulkReview
      title="Bulk tags"
      operationId="op-1"
      expiresAt={FUTURE}
      items={mixed}
      busy={false}
      onApply={() => {}}
      {...props}
    />
  );
}

describe("BulkResults", () => {
  test("shows the counts and the download in English", () => {
    const markup = renderAdminInEnglish(<BulkResults items={mixed} />);
    expectNoChineseText(markup);
    expect(markup).toContain('aria-label="Results by item"');
    expect(markup).toContain("1 pending · 1 succeeded · 1 skipped · 1 conflict · 1 failed");
    expect(markup).toContain("Download results by item (CSV)");
  });

  test("says conflict for one and conflicts for every other number", () => {
    const withConflicts = (count: number): BulkItemResult[] =>
      Array.from({ length: count }, (_, index) => ({
        entityId: `id-${index}`,
        status: "conflict",
        reasonCode: null,
        before: "a",
        after: "b",
      }));
    expect(
      bulkCopy.en.results.summary({ pending: 0, succeeded: 0, skipped: 0, conflict: 1, failed: 0 }),
    ).toContain("1 conflict ·");
    expect(renderAdminInEnglish(<BulkResults items={withConflicts(3)} />)).toContain("3 conflicts");
    expect(renderAdminInEnglish(<BulkResults items={withConflicts(0)} />)).toContain("0 conflicts");
    expect(renderAdminInEnglish(<BulkResults items={withConflicts(1)} />)).not.toContain(
      "1 conflicts",
    );
    // Chinese has no plural: the count reads the same.
    expect(renderAdminInChinese(<BulkResults items={withConflicts(1)} />)).toContain("衝突 1");
    expect(renderAdminInChinese(<BulkResults items={withConflicts(3)} />)).toContain("衝突 3");
  });

  test("shows the counts and the download in Chinese, as before", () => {
    const markup = renderAdminInChinese(<BulkResults items={mixed} />);
    expect(markup).toContain('aria-label="逐筆結果"');
    expect(markup).toContain("待處理 1 · 成功 1 · 略過 1 · 衝突 1 · 失敗 1");
    expect(markup).toContain("下載逐筆結果 CSV");
  });

  test("shows Chinese outside the provider", () => {
    expect(renderToStaticMarkup(<BulkResults items={[]} />)).toContain("待處理 0");
  });
});

describe("BulkReview", () => {
  test("shows the preview, the changes and the confirmation in English", () => {
    const markup = renderAdminInEnglish(review());
    expectNoChineseText(markup);
    for (const text of [
      "Preview expires: ",
      'aria-label="Changes to apply, by item"',
      ">Item<",
      ">Before<",
      ">After<",
      ">Result<",
      "I have checked the selected items and the changes before and after",
      "Apply pending items",
      "Technical reference",
      "old tag",
      "new tag",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toContain("28 Sep 2099 (Mon) 09:00");
    expect(markup).not.toContain("Expired");
  });

  test("names each item's result in English and keeps its reason code as a code", () => {
    const markup = renderAdminInEnglish(review());
    expectNoChineseText(markup);
    for (const cell of [
      '<td class="p-2">Pending</td>',
      '<td class="p-2">Succeeded</td>',
      '<td class="p-2">Skipped · <code>no_change</code></td>',
      '<td class="p-2">Conflict · <code>version_changed</code></td>',
      '<td class="p-2">Failed · <code>not_found</code></td>',
    ]) {
      expect(markup, cell).toContain(cell);
    }
    expect(bulkCopy.en.review.status).toEqual({
      pending: "Pending",
      succeeded: "Succeeded",
      skipped: "Skipped",
      conflict: "Conflict",
      failed: "Failed",
    });
  });

  test("keeps the Chinese result cells as the stored codes, as before", () => {
    const markup = renderAdminInChinese(review());
    for (const cell of [
      '<td class="p-2">pending</td>',
      '<td class="p-2">succeeded</td>',
      '<td class="p-2">skipped · no_change</td>',
      '<td class="p-2">conflict · version_changed</td>',
      '<td class="p-2">failed · not_found</td>',
    ]) {
      expect(markup, cell).toContain(cell);
    }
    expect(markup).not.toContain("<code>no_change</code>");
  });

  test("says when the preview has expired and what to do", () => {
    const markup = renderAdminInEnglish(review({ expiresAt: PAST }));
    expectNoChineseText(markup);
    expect(markup).toContain("Expired. Preview again.");
    expect(markup).toContain("1 Jan 2000 (Sat) 08:00");
  });

  test("shows the busy label and the batch label in English", () => {
    expect(renderAdminInEnglish(review({ busy: true }))).toContain("In progress…");
    const many: BulkItemResult[] = Array.from({ length: 30 }, (_, index) => ({
      entityId: `id-${index}`,
      status: "pending",
      reasonCode: null,
      before: "a",
      after: "b",
    }));
    const markup = renderAdminInEnglish(review({ items: many }));
    expectNoChineseText(markup);
    expect(markup).toContain("Apply the next 25");
    expect(markup).toContain('aria-label="Bulk preview pagination"');
    expect(markup).toContain(">Previous<");
    expect(markup).toContain(">Next<");
  });

  test("keeps the Chinese screen as it was", () => {
    const markup = renderAdminInChinese(review({ title: "批量標籤" }));
    expect(markup).toContain(
      `預覽到期：${new Date(FUTURE).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" })}`,
    );
    for (const text of [
      'aria-label="逐筆套用差異"',
      ">項目<",
      ">原本<",
      ">套用後<",
      ">結果<",
      "確認已核對所選範圍及套用前後差異",
      "套用待處理項目",
      "技術參考",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(renderAdminInChinese(review({ expiresAt: PAST }))).toContain(" · 已過期，請重新預覽");
    expect(renderAdminInChinese(review({ busy: true }))).toContain("處理中…");
  });

  test("renders without a provider, as its parents' tests do", () => {
    expect(renderToStaticMarkup(review())).toContain("確認已核對");
  });
});

describe("bulkCopy", () => {
  test("has no Chinese in English", () => {
    expectNoChineseInCopy(bulkCopy.en);
  });
});
