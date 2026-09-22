import { describe, expect, mock, test } from "bun:test";

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  redirect: (options: unknown) => options,
}));

import { Route } from "./cccp";

describe("retired CCCP route", () => {
  test("permanently redirects old links to TNR", () => {
    const beforeLoad = Route.options.beforeLoad!;
    expect(() => beforeLoad({} as never)).toThrow();
    try {
      beforeLoad({} as never);
    } catch (result) {
      expect(result).toMatchObject({ to: "/about/tnr", statusCode: 301 });
    }
  });
});
