import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SupporterRecordSummary } from "./SupporterPortal";

test("verified supporter has clear empty and staff-assistance states", () => {
  const markup = renderToStaticMarkup(
    <SupporterRecordSummary
      records={{
        adoption: [],
        sponsorship: [],
        donations: [],
        receipts: [],
        marketingEmail: null,
      }}
      onReceipt={() => {}}
      onPreference={() => {}}
      preferenceSaving={false}
    />,
  );
  expect(markup).toContain("未找到");
  expect(markup).toContain("職員");
  expect(markup).toContain("交易");
  expect(markup).toContain("同意接收推廣電郵");
  expect(markup).toContain("停止接收推廣電郵");
});
