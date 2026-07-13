import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

describe("public site chrome", () => {
  test("uses the official logo and adoption-led action hierarchy", async () => {
    const { Header } = await import("./Header");
    const markup = renderToStaticMarkup(<Header />);

    expect(markup).toContain("/brand/hkscda-logo-primary.jpg");
    expect(markup).toContain("查看待領養動物");
    expect(markup).toContain("立即捐助");
    expect(markup).not.toContain("shimmer-surface");
    expect(markup).not.toContain("PawPrint");
  });

  test("footer keeps verified organisation identity without paw or emoji decoration", async () => {
    const { Footer } = await import("./Footer");
    const markup = renderToStaticMarkup(<Footer />);

    expect(markup).toContain("/brand/hkscda-logo-primary.jpg");
    expect(markup).toContain("91/14493");
    expect(markup).not.toContain("🐾");
    expect(markup).not.toContain("pink-strip");
  });
});
