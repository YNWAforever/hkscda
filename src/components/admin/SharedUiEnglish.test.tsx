import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DataTable } from "./DataTable";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "./i18n/testing";
import { LoadFailure, StatFigure } from "./LoadFailure";
import { sharedUiCopy } from "./sharedUiCopy";
import { TablePager } from "./TablePager";

const noop = () => {};
type Row = { name: string };
const columns = [{ id: "name", header: "Name", cell: (row: Row) => row.name }];

function table(
  props: {
    rows?: Row[];
    empty?: ReactNode;
    loading?: boolean;
    error?: unknown;
    onRetry?: () => void;
  } = {},
) {
  const { error, onRetry, ...rest } = props;
  const failure = error === undefined ? {} : { error, onRetry: onRetry ?? noop };
  return (
    <DataTable<Row>
      columns={columns}
      rows={[]}
      getRowKey={(row) => row.name}
      renderMobileCard={(row) => <span>{row.name}</span>}
      {...rest}
      {...failure}
    />
  );
}

describe("LoadFailure in English", () => {
  test("says what happened and what to do, with the error reference", () => {
    const markup = renderAdminInEnglish(
      <LoadFailure error={new Error("boom")} onRetry={() => {}} />,
    );
    expectNoChineseText(markup);
    expect(markup).toContain("Could not load");
    expect(markup).toContain("Try again. If the problem continues, quote this error reference:");
    expect(markup).toMatch(/<button[^>]*>Retry<\/button>/);
    expect(markup).toMatch(/<span class="font-mono">[0-9A-F]{6}<\/span>/);
  });

  test("shows the retrying label while a retry is in flight", () => {
    const markup = renderAdminInEnglish(
      <LoadFailure error={new Error("boom")} onRetry={() => {}} retrying />,
    );
    expectNoChineseText(markup);
    expect(markup).toContain("Retrying…");
  });

  test("keeps a title the caller passes, and a caller's null title", () => {
    expect(
      renderAdminInEnglish(<LoadFailure error="x" onRetry={noop} title="Could not load cases" />),
    ).toContain("Could not load cases");
    const none = renderAdminInEnglish(<LoadFailure error="x" onRetry={noop} title={null} />);
    expect(none).not.toContain("Could not load");
    expect(none).toContain("Try again.");
  });

  test("never shows the raw error text", () => {
    const markup = renderAdminInEnglish(
      <LoadFailure error={new Error("password=hunter2")} onRetry={noop} />,
    );
    expect(markup).not.toContain("hunter2");
  });

  test("labels an unavailable figure in English", () => {
    const markup = renderAdminInEnglish(<StatFigure value={3} failed />);
    expectNoChineseText(markup);
    expect(markup).toContain('title="Could not load"');
  });
});

describe("LoadFailure in Chinese", () => {
  test("is unchanged", () => {
    const markup = renderAdminInChinese(<LoadFailure error={new Error("x")} onRetry={() => {}} />);
    expect(markup).toContain("無法載入");
    expect(markup).toContain("請重試。若問題持續，請提供錯誤編號 ");
    expect(markup).toMatch(/<button[^>]*>重試<\/button>/);
    expect(renderAdminInChinese(<LoadFailure error="x" onRetry={() => {}} retrying />)).toContain(
      "重試中…",
    );
    expect(renderAdminInChinese(<StatFigure value={3} failed />)).toContain('title="無法載入"');
  });

  test("shows Chinese outside the provider, so a parent's own test needs none", () => {
    expect(renderToStaticMarkup(<LoadFailure error="x" onRetry={noop} />)).toContain("無法載入");
    expect(renderToStaticMarkup(table())).toContain("沒有結果");
  });
});

describe("DataTable in English", () => {
  test("shows the empty state, the failure and the loading state without Chinese", () => {
    const empty = renderAdminInEnglish(table());
    expectNoChineseText(empty);
    expect(empty).toContain("No results");

    const failed = renderAdminInEnglish(table({ error: new Error("boom"), onRetry: () => {} }));
    expectNoChineseText(failed);
    expect(failed).toContain("Could not load");
    expect(failed).not.toContain("No results");

    expectNoChineseText(renderAdminInEnglish(table({ loading: true })));
  });

  test("keeps an empty state the caller passes", () => {
    expect(renderAdminInEnglish(table({ empty: "Nothing here" }))).toContain("Nothing here");
    expect(renderAdminInEnglish(table({ empty: "Nothing here" }))).not.toContain("No results");
  });

  test("shows rows as given", () => {
    const markup = renderAdminInEnglish(table({ rows: [{ name: "小白" }] }));
    expectNoChineseText(markup, { allow: ["小白"] });
    expect(markup).toContain("小白");
  });
});

describe("TablePager in English", () => {
  const pager = (props: Partial<Parameters<typeof TablePager>[0]> = {}) => (
    <TablePager page={2} pageSize={25} total={100} onPageChange={() => {}} {...props} />
  );

  test("describes the window, the page and the controls without Chinese", () => {
    const markup = renderAdminInEnglish(pager());
    expectNoChineseText(markup);
    expect(markup).toContain("Showing 26–50 of 100");
    expect(markup).toContain("2 / 4");
    expect(markup).toContain("Previous");
    expect(markup).toContain("Next");
    expect(markup).toContain('aria-label="Records pagination"');
  });

  test("describes a window when the total is unknown", () => {
    const markup = renderAdminInEnglish(pager({ total: undefined }));
    expectNoChineseText(markup);
    expect(markup).toContain("Page 2 (showing 26–50)");
  });

  test("names what is paged", () => {
    expect(renderAdminInEnglish(pager({ label: "Registrations" }))).toContain(
      'aria-label="Registrations pagination"',
    );
  });
});

describe("TablePager in Chinese", () => {
  test("is unchanged", () => {
    const markup = renderAdminInChinese(
      <TablePager page={2} pageSize={25} total={100} onPageChange={() => {}} />,
    );
    expect(markup).toContain("顯示第 26–50 項，共 100 項");
    expect(markup).toContain('aria-label="資料分頁"');
    expect(markup).toContain("上一頁");
    expect(markup).toContain("下一頁");
    expect(
      renderAdminInChinese(
        <TablePager page={2} pageSize={25} total={undefined} onPageChange={() => {}} />,
      ),
    ).toContain("第 2 頁（第 26–50 項）");
  });
});

describe("sharedUiCopy", () => {
  test("has no Chinese in English", () => {
    expectNoChineseInCopy(sharedUiCopy.en);
  });
});
