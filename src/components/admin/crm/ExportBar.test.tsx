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
  backgroundExport: "建立背景匯出",
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

  test("disables immediate and retry exports while supporter filters are refreshing", () => {
    const idle = renderToStaticMarkup(
      <ExportBarView
        copy={copy}
        state={{ phase: "idle" }}
        busy
        onExport={() => undefined}
        onRetry={() => undefined}
      />,
    );
    expect(idle.match(/disabled=""/g) ?? []).toHaveLength(2);
    const failed = renderToStaticMarkup(
      <ExportBarView
        copy={copy}
        state={{
          phase: "error",
          kind: "supporters",
          snapshot: "q=Ada",
          message: "Too large",
          overLimit: true,
        }}
        busy
        onExport={() => undefined}
        onRetry={() => undefined}
        onBackground={() => undefined}
      />,
    );
    expect(failed.match(/disabled=""/g) ?? []).toHaveLength(4);
  });
  test("shows actionable 413 and a retry for the exact failed filter snapshot", async () => {
    const error = await classifyExportFailure(
      Response.json({ total: 5001, limit: 5000 }, { status: 413 }),
      "zh",
    );
    expect(error).toContain("5,001");
    expect(error).toContain("縮小篩選");
    expect(error).toContain("建立背景匯出");
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

  test("distinguishes the bounded background job limit from immediate CSV", async () => {
    const error = await classifyExportFailure(
      Response.json({ limit: 20000 }, { status: 413 }),
      "zh",
    );
    expect(error).toContain("20,000");
    expect(error).not.toContain("5,000");
  });

  test("offers a background job only for the overflow error", () => {
    const markup = renderToStaticMarkup(
      <ExportBarView
        copy={copy}
        state={{
          phase: "error",
          kind: "donations",
          snapshot: "role=donor",
          message: "5,001 rows",
          overLimit: true,
        }}
        onExport={() => undefined}
        onRetry={() => undefined}
        onBackground={() => undefined}
      />,
    );
    expect(markup).toContain("建立背景匯出");
    const forbidden = renderToStaticMarkup(
      <ExportBarView
        copy={copy}
        state={{
          phase: "error",
          kind: "donations",
          snapshot: "role=donor",
          message: "Forbidden",
          overLimit: false,
        }}
        onExport={() => undefined}
        onRetry={() => undefined}
        onBackground={() => undefined}
      />,
    );
    expect(forbidden).not.toContain("建立背景匯出");
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
