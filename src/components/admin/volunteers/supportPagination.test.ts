import { describe, expect, test } from "bun:test";

import { paginateSupport, SUPPORT_PAGE_SIZE } from "./supportPagination";

describe("support pagination", () => {
  test("bounds the rendered page without losing records across the cap", () => {
    const items = Array.from({ length: 500 }, (_, index) => index);
    const pages = Array.from({ length: 20 }, (_, index) => paginateSupport(items, index + 1));

    expect(SUPPORT_PAGE_SIZE).toBe(25);
    expect(pages[0]?.items).toHaveLength(25);
    expect(pages[0]?.items[0]).toBe(0);
    expect(pages[0]?.items.at(-1)).toBe(24);
    expect(pages[19]?.items[0]).toBe(475);
    expect(pages[19]?.items.at(-1)).toBe(499);
    expect(pages.flatMap((page) => page.items)).toEqual(items);
  });

  test("handles empty, exact-page and overshooting page requests", () => {
    expect(paginateSupport([], 1)).toMatchObject({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
    });
    expect(
      paginateSupport(
        Array.from({ length: 25 }, (_, index) => index),
        99,
      ),
    ).toMatchObject({
      page: 1,
      pageCount: 1,
      total: 25,
    });
    expect(
      paginateSupport(
        Array.from({ length: 26 }, (_, index) => index),
        99,
      ),
    ).toMatchObject({
      page: 2,
      pageCount: 2,
      total: 26,
    });
  });
});
