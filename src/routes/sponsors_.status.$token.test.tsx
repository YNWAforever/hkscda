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

mock.module("../components/site/sponsorship/PledgeStatusPage", () => ({
  PledgeStatusPage: ({ token }: { token: string }) => <p>token:{token}</p>,
}));

describe("sponsorship status route", () => {
  test("wraps PledgeStatusPage with a private-link trust note and no breadcrumb", async () => {
    const { SponsorshipStatusView } = await import("./sponsors_.status.$token");
    const markup = renderToStaticMarkup(<SponsorshipStatusView token="xyz789" />);

    expect(markup).toContain("token:xyz789");
    expect(markup).toContain("trust-cue");
    expect(markup).toContain("此為私人查閱連結，請勿轉發。");
    expect(markup).not.toContain("detail-breadcrumb");
  });
});
