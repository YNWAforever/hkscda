import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ExportBarView } from "./ExportBar";
import { classifyExportFailure } from "./exportFailure";

const copy = {
  supportersCsv: "支持者 CSV",
  donationsCsv: "捐款 CSV",
  exporting: "匯出中...",
  retry: "重試相同條件",
  downloaded: "下載已開始",
};

describe("CRM ExportBar state", () => {
  test("renders progress and blocks both buttons while one export is pending", () => {
    const markup = renderToStaticMarkup(
      <ExportBarView
        copy={copy}
        state={{ phase: "exporting", kind: "supporters", snapshot: "q=Ada" }}
        onExport={() => undefined}
        onRetry={() => undefined}
      />,
    );
    expect(markup).toContain("匯出中...");
    expect(markup.match(/disabled=""/g) ?? []).toHaveLength(2);
    expect(markup).toContain('role="status"');
  });

  test("shows actionable 413 and a retry for the exact failed filter snapshot", async () => {
    const error = await classifyExportFailure(
      Response.json({ total: 5001, limit: 5000 }, { status: 413 }),
      "zh",
    );
    expect(error).toContain("5,001");
    expect(error).toContain("縮小篩選");
    const markup = renderToStaticMarkup(
      <ExportBarView
        copy={copy}
        state={{ phase: "error", kind: "supporters", snapshot: "q=Ada&role=donor", message: error }}
        onExport={() => undefined}
        onRetry={() => undefined}
      />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("重試相同條件");
  });

  test.each([401, 403, 500])("classifies HTTP %i without leaking a server body", async (status) => {
    const error = await classifyExportFailure(
      new Response("<h1>private server details</h1>", { status }),
      "zh",
    );
    expect(error).not.toContain("private server details");
    expect(error.length).toBeGreaterThan(4);
  });
});
