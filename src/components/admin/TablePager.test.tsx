import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TablePager } from "./TablePager";

function render(props: Partial<Parameters<typeof TablePager>[0]> = {}) {
  return renderToStaticMarkup(
    <TablePager page={1} pageSize={25} total={100} onPageChange={() => {}} {...props} />,
  );
}

describe("TablePager", () => {
  test("renders nothing when everything fits on one page", () => {
    // Controls that can only ever be disabled are noise.
    expect(render({ total: 25 })).toBe("");
    expect(render({ total: 0 })).toBe("");
  });

  test("reports the current window and the true total", () => {
    const markup = render({ page: 2, pageSize: 25, total: 100 });
    expect(markup).toContain("26");
    expect(markup).toContain("50");
    expect(markup).toContain("100");
    expect(markup).toContain("2 / 4");
  });

  test("clamps the last window to the total rather than the page boundary", () => {
    // 3 rows on the final page, not 25.
    const markup = render({ page: 3, pageSize: 25, total: 53 });
    expect(markup).toContain("51");
    expect(markup).toContain("53");
  });

  test("disables previous on the first page and next on the last", () => {
    expect(render({ page: 1, total: 100 })).toMatch(/上一頁[\s\S]*?<\/button>/);
    // Both buttons exist; the first is disabled on page 1, the second on page 4.
    expect((render({ page: 1, total: 100 }).match(/disabled=""/g) ?? []).length).toBe(1);
    expect((render({ page: 4, total: 100 }).match(/disabled=""/g) ?? []).length).toBe(1);
    expect((render({ page: 2, total: 100 }).match(/disabled=""/g) ?? []).length).toBe(0);
  });

  test("keeps next enabled when the total is unknown", () => {
    // An API that omits `total` must not strand the operator on page 1 — the
    // whole point of this component is that unreachable rows are the bug.
    const markup = render({ page: 1, total: undefined });
    expect(markup).not.toBe("");
    expect((markup.match(/disabled=""/g) ?? []).length).toBe(1); // previous only
  });

  test("disables both controls while a fetch is in flight", () => {
    expect((render({ page: 2, total: 100, busy: true }).match(/disabled=""/g) ?? []).length).toBe(
      2,
    );
  });

  test("labels the nav region for screen readers", () => {
    expect(render({ label: "報名" })).toContain("報名分頁");
  });
});
