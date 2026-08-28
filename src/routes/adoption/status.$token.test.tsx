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

mock.module("../../components/site/adoption/StatusPage", () => ({
  StatusPage: ({ token }: { token: string }) => <p>token:{token}</p>,
}));

describe("adoption status route", () => {
  test("wraps StatusPage with a private-link trust note and no breadcrumb", async () => {
    const { AdoptionStatusView } = await import("./status.$token");
    const markup = renderToStaticMarkup(<AdoptionStatusView token="abc123" />);

    expect(markup).toContain("token:abc123");
    expect(markup).toContain("trust-cue");
    expect(markup).toContain("此為私人查閱連結，請勿轉發。");
    expect(markup).not.toContain("detail-breadcrumb");
  });
});
