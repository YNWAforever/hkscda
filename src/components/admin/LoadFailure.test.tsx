import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DataTable } from "./DataTable";
import { LoadFailure, StatFigure, errorReference, STAT_UNAVAILABLE } from "./LoadFailure";

const columns = [
  { id: "name", header: "名稱", cell: (row: { name: string }) => row.name },
] as const;

function renderTable(props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <DataTable
      columns={[...columns]}
      rows={[] as { name: string }[]}
      getRowKey={(row) => row.name}
      empty="沒有結果"
      {...props}
    />,
  );
}

describe("errorReference", () => {
  test("is stable for the same fault so a retry quotes one reference", () => {
    const first = errorReference(new Error("relation volunteer_activity_counts does not exist"));
    const second = errorReference(new Error("relation volunteer_activity_counts does not exist"));
    expect(first).toBe(second);
  });

  test("distinguishes different faults", () => {
    expect(errorReference(new Error("a"))).not.toBe(errorReference(new Error("b")));
  });

  test("survives values that are not Errors and do not serialise", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(errorReference(circular)).toMatch(/^[0-9A-F]{6}$/);
    expect(errorReference("plain string")).toMatch(/^[0-9A-F]{6}$/);
    expect(errorReference(undefined)).toMatch(/^[0-9A-F]{6}$/);
  });
});

describe("LoadFailure", () => {
  test("never renders the raw error text", () => {
    // Provider and Postgres errors carry table names, row contents and
    // connection strings. An operator gets a reference, not the payload.
    const markup = renderToStaticMarkup(
      <LoadFailure error={new Error("password=hunter2 relation supporter does not exist")} />,
    );
    expect(markup).not.toContain("hunter2");
    expect(markup).not.toContain("supporter");
    expect(markup).toContain("無法載入");
  });

  test("offers a retry control only when a retry is possible", () => {
    // Asserted on the control itself, not the word: the guidance copy
    // ("請重試。若問題持續…") contains 重試 whether or not a button is rendered.
    expect(
      renderToStaticMarkup(<LoadFailure error={new Error("x")} onRetry={() => {}} />),
    ).toContain("<button");
    expect(renderToStaticMarkup(<LoadFailure error={new Error("x")} />)).not.toContain("<button");
  });

  test("disables the retry control while a retry is in flight", () => {
    const markup = renderToStaticMarkup(
      <LoadFailure error={new Error("x")} onRetry={() => {}} retrying />,
    );
    expect(markup).toContain("disabled");
  });
});

describe("StatFigure", () => {
  test("shows the unavailable marker instead of a figure when the source failed", () => {
    const markup = renderToStaticMarkup(<StatFigure value={0} failed />);
    expect(markup).toContain(STAT_UNAVAILABLE);
    expect(markup).not.toContain(">0<");
  });

  test("shows a genuine zero when the load succeeded", () => {
    // Zero is a real answer -- "nothing is waiting" -- and must stay readable.
    expect(renderToStaticMarkup(<StatFigure value={0} failed={false} />)).toContain("0");
  });
});

describe("DataTable failure state", () => {
  test("a failed load is not rendered as the empty state", () => {
    // The defect this closes: a failed fetch also yields zero rows, so the
    // empty copy ("沒有結果") told the operator there was no work waiting when
    // in fact nothing had been read.
    const markup = renderTable({ error: new Error("boom") });
    expect(markup).toContain("無法載入");
    expect(markup).not.toContain("沒有結果");
  });

  test("a genuinely empty result still shows the empty state", () => {
    const markup = renderTable();
    expect(markup).toContain("沒有結果");
    expect(markup).not.toContain("無法載入");
  });

  test("loading takes precedence over the failure state", () => {
    // A refetch that has not resolved yet is not a failure.
    const markup = renderTable({ error: new Error("boom"), loading: true });
    expect(markup).not.toContain("無法載入");
  });

  test("rows are not rendered alongside a failure", () => {
    // Stale rows next to an error read as "this is the current list".
    const markup = renderToStaticMarkup(
      <DataTable
        columns={[...columns]}
        rows={[{ name: "STALE-ROW" }]}
        getRowKey={(row) => row.name}
        error={new Error("boom")}
      />,
    );
    expect(markup).not.toContain("STALE-ROW");
    expect(markup).toContain("無法載入");
  });

  test("the mobile card layout also shows the failure instead of the empty state", () => {
    const markup = renderTable({
      error: new Error("boom"),
      renderMobileCard: (row: { name: string }) => <div>{row.name}</div>,
    });
    expect(markup).toContain("無法載入");
    expect(markup).not.toContain("沒有結果");
  });
});
