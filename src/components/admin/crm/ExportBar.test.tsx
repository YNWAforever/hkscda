import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminSessionError } from "../../../lib/admin/session";
import { ExportBarView } from "./ExportBar";
import { exportCopy } from "./exportCopy";
import {
  classifyExportFailure,
  CsvExportError,
  failureOfCreateError,
  failureOfExportError,
} from "./exportFailure";

const copy = {
  supportersCsv: "支持者 CSV",
  donationsCsv: "捐款 CSV",
  exporting: "匯出中...",
  retry: "重試相同條件",
  downloaded: "下載已開始",
  backgroundExport: "建立背景匯出",
  failure: exportCopy.zh.failure,
};

describe("CRM ExportBar state", () => {
  test("blocks new exports and retries while list filters are pending", () => {
    const markup = renderToStaticMarkup(
      <ExportBarView
        copy={copy}
        busy
        state={{
          phase: "error",
          kind: "supporters",
          snapshot: "q=Ada",
          failure: { code: "immediate_limit", total: 5001 },
          overLimit: true,
        }}
        onExport={() => undefined}
        onRetry={() => undefined}
        onBackground={() => undefined}
      />,
    );
    expect(markup.match(/disabled=""/g) ?? []).toHaveLength(4);
  });
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
    const failure = await classifyExportFailure(
      Response.json({ total: 5001, limit: 5000 }, { status: 413 }),
    );
    expect(failure).toEqual({ code: "immediate_limit", total: 5001 });
    const error = copy.failure(failure);
    expect(error).toContain("5,001");
    expect(error).toContain("縮小篩選");
    expect(error).toContain("建立背景匯出");
    const markup = renderToStaticMarkup(
      <ExportBarView
        copy={copy}
        state={{ phase: "error", kind: "supporters", snapshot: "q=Ada&role=donor", failure }}
        onExport={() => undefined}
        onRetry={() => undefined}
      />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("重試相同條件");
    expect(markup).toContain("5,001");
  });

  test("distinguishes the bounded background job limit from immediate CSV", async () => {
    const failure = await classifyExportFailure(Response.json({ limit: 20000 }, { status: 413 }));
    expect(failure).toEqual({ code: "background_limit" });
    const error = copy.failure(failure);
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
          failure: { code: "immediate_limit", total: 5001 },
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
          failure: { code: "forbidden" },
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
    const failure = await classifyExportFailure(
      new Response("<h1>private server details</h1>", { status }),
    );
    const error = copy.failure(failure);
    expect(error).not.toContain("private server details");
    expect(error.length).toBeGreaterThan(4);
  });

  test("keeps the Chinese messages for each response status as they were", async () => {
    const message = async (status: number) =>
      copy.failure(await classifyExportFailure(new Response("", { status })));
    expect(await message(401)).toBe("登入已過期，請重新登入後再試。");
    expect(await message(403)).toBe("你沒有權限匯出這些資料。");
    expect(await message(500)).toBe("伺服器未能完成匯出，請稍後重試。");
    expect(await message(400)).toBe("匯出未完成，請重試。");
    const noTotal = await classifyExportFailure(Response.json({}, { status: 413 }));
    expect(noTotal).toEqual({ code: "immediate_limit", total: null });
    expect(copy.failure(noTotal)).toBe(
      "符合的資料超過 5,000 筆即時匯出上限。請縮小篩選後重試；或建立背景匯出。",
    );
    expect(
      copy.failure(
        await classifyExportFailure(Response.json({ total: 5001, limit: 5000 }, { status: 413 })),
      ),
    ).toBe("符合 5,001 筆資料超過 5,000 筆即時匯出上限。請縮小篩選後重試；或建立背景匯出。");
    expect(copy.failure({ code: "background_limit" })).toBe(
      "背景匯出最多 20,000 筆。請縮小篩選後重試。",
    );
  });

  test("a missing session shows its own message in each language, without matching text", () => {
    // getAdminAccessToken throws this when nobody is signed in. The bar checks its code, so it
    // does not depend on the zh-HK message the error carries.
    const notSignedIn = new AdminSessionError("not_signed_in");
    expect(notSignedIn.message).toBe("未登入");
    const failure = failureOfExportError(notSignedIn);
    expect(failure).toEqual({ code: "sign_in_required" });
    expect(exportCopy.zh.failure(failure)).toBe("請登入後再試。");
    expect(exportCopy.en.failure(failure)).toBe("Sign in before exporting.");
    // An error with the same text but not from the token lookup is a network failure.
    expect(failureOfExportError(new Error("未登入"))).toEqual({ code: "network" });
    expect(failureOfExportError(new TypeError("Failed to fetch"))).toEqual({ code: "network" });
    expect(exportCopy.zh.failure({ code: "network" })).toBe("網絡或下載失敗，請檢查連線後重試。");
  });

  test("a refused request keeps its own failure, and a background export names its error", () => {
    const refused = new CsvExportError({ code: "forbidden" }, 403);
    expect(failureOfExportError(refused)).toEqual({ code: "forbidden" });
    expect(failureOfCreateError(refused)).toEqual({ code: "forbidden" });
    expect(failureOfCreateError(new AdminSessionError("not_signed_in"))).toEqual({
      code: "not_signed_in",
    });
    expect(exportCopy.zh.failure({ code: "not_signed_in" })).toBe("未登入");
    expect(exportCopy.en.failure({ code: "not_signed_in" })).toBe("Not signed in. Sign in again.");
    // Any other error shows the message it carried, as it did before.
    const other = failureOfCreateError(new Error("Gateway timeout"));
    expect(other).toEqual({ code: "create_failed", detail: "Gateway timeout" });
    expect(exportCopy.zh.failure(other)).toBe("Gateway timeout");
    expect(exportCopy.zh.failure(failureOfCreateError("boom"))).toBe("無法建立背景匯出。");
  });
});
