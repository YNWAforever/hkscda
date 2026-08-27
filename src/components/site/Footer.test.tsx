import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { brand } from "../../lib/brand/brand";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const markup = async () => {
  const { Footer } = await import("./Footer");
  return renderToStaticMarkup(<Footer />);
};

describe("Footer navigation", () => {
  test("links visitors to the knowledge hub and group volunteering", async () => {
    const html = await markup();
    expect(html).toContain('href="/knowledge"');
    expect(html).toContain('href="/volunteer/group"');
  });

  test("uses the public footer treatment", async () => {
    const html = await markup();
    // Previously a source grep for bg-[var(--color-footer-bg)]; the ported
    // .site-footer resolves that token in public.css instead of inline.
    expect(html).toContain('class="site-footer"');
    expect(html).toContain("public-footer-link");
  });

  test("marks itself inert-able for the mobile drawer", async () => {
    // The header sets [inert] on [data-site-footer] while the drawer is open.
    expect(await markup()).toContain("data-site-footer");
  });
});

describe("Footer operational details", () => {
  test("states registration and contact details from the brand constants", async () => {
    const html = await markup();
    expect(html).toContain(brand.org.charityFileNumber);
    expect(html).toContain(brand.org.afcdLicenceNumber);
    expect(html).toContain(brand.org.email);
    expect(html).toContain(brand.org.phone);
  });

  test("guards every new-tab link with the opener protection", async () => {
    const html = await markup();
    const external = html.match(/target="_blank"/g) ?? [];
    expect(external.length).toBeGreaterThan(0);
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(external.length);
  });

  test("keeps every internal destination same-origin", async () => {
    const html = await markup();
    expect(html).not.toContain("hkscda.vercel.app");
    expect(html).not.toContain("chatgpt.site");
  });
});
