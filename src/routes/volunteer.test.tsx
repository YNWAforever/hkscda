import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PUBLIC_INDIVIDUAL_MIN_AGE } from "../lib/volunteers/types";

describe("volunteer route copy", () => {
  test("shows the individual volunteer age floor and group enquiry link", () => {
    const source = readFileSync(new URL("./volunteer.tsx", import.meta.url), "utf8");

    expect(source).toContain("\u500b\u4eba\u7fa9\u5de5\u5831\u540d");
    expect(source).toContain("\u53ea\u63a5\u53d7");
    expect(source).toContain("PUBLIC_INDIVIDUAL_MIN_AGE");
    expect(source).toContain("\u6b72\u4ee5\u4e0a\u500b\u4eba\u7fa9\u5de5\u7533\u8acb");
    expect(source).toContain('href="/volunteer/group"');
  });
});

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useRouterState: () => "/volunteer",
  Outlet: () => null,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("volunteer route directory wrap", () => {
  test("wraps the directory page in PublicFormFrame with a trust note and no breadcrumb", async () => {
    const originalFetch = global.fetch;
    global.fetch = (() => new Promise(() => {})) as unknown as typeof fetch;
    try {
      const { VolunteerPage } = await import("./volunteer");
      const markup = renderToStaticMarkup(<VolunteerPage />);

      expect(markup).toContain("trust-cue");
      expect(markup).toContain(
        "\u4f60\u7684\u500b\u4eba\u8cc7\u6599\u53ea\u6703\u7528\u65bc\u7fa9\u5de5\u767b\u8a18\u53ca\u806f\u7d61\uff0c\u4e0d\u6703\u4f5c\u5176\u4ed6\u7528\u9014\u3002",
      );
      expect(markup).not.toContain("detail-breadcrumb");
      expect(markup).toContain("\u4ed6\u5011\uff0c\u9700\u8981\u4f60\u7684\u63f4\u624b");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
