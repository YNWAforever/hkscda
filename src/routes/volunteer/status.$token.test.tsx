import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("volunteer status route", () => {
  test("wraps the status view with a private-link trust note and no breadcrumb", async () => {
    const originalFetch = global.fetch;
    global.fetch = (() => new Promise(() => {})) as unknown as typeof fetch;
    try {
      const { VolunteerStatusView } = await import("./status.$token");
      const markup = renderToStaticMarkup(<VolunteerStatusView token="abc123" />);

      expect(markup).toContain("正在載入義工登記");
      expect(markup).toContain("trust-cue");
      expect(markup).toContain("此為私人查閱連結，請勿轉發。");
      expect(markup).not.toContain("detail-breadcrumb");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
