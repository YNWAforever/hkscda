import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BulkReview } from "./BulkReview";

test("bulk review presents snapshot, before/after, per-item outcomes and confirmation", () => {
  const html = renderToStaticMarkup(
    <BulkReview
      title="批量標籤"
      operationId="op1"
      expiresAt="2099-09-28T01:00:00Z"
      items={[
        { entityId: "id1", status: "pending", reasonCode: null, before: "舊標籤", after: "新標籤" },
      ]}
      busy={false}
      onApply={() => {}}
    />,
  );
  expect(html).toContain("待處理 1");
  expect(html).toContain("舊標籤");
  expect(html).toContain("新標籤");
  expect(html).toContain("確認已核對");
});
