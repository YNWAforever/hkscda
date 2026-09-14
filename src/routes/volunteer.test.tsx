import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("volunteer route copy", () => {
  test("routes members to policy-backed sessions and a direct group enquiry", () => {
    const source = readFileSync(new URL("./volunteer.tsx", import.meta.url), "utf8");
    const signup = readFileSync(
      new URL("../components/site/volunteer/PolicySignup.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("<PolicySignup />");
    expect(source).toContain('href="/volunteer/group"');
    expect(source).not.toContain("buildVolunteerRegistrationPayload");
    expect(signup).toContain("session.policy.eligibility.min_age");
    expect(signup).toContain("歲或以上");
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

      expect(markup.match(/<main(?:\s|>)/g)).toHaveLength(1);
      expect(markup.match(/<\/main>/g)).toHaveLength(1);
      expect(markup).toContain("trust-cue");
      expect(markup).toContain(
        "\u4f60\u7684\u500b\u4eba\u8cc7\u6599\u53ea\u6703\u7528\u65bc\u7fa9\u5de5\u767b\u8a18\u53ca\u806f\u7d61\uff0c\u4e0d\u6703\u4f5c\u5176\u4ed6\u7528\u9014\u3002",
      );
      expect(markup).not.toContain("detail-breadcrumb");
      expect(markup).toContain("選擇合適的服務時間，一起為等待家的貓狗出一分力。");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
