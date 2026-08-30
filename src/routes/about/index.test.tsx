import { describe, expect, test, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AboutContent } from "./index";
import type { AboutPageContent } from "../../lib/aboutPages/types";

// AboutContent renders through PublicPageFrame, which uses router links.
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children?: unknown; to: string }) => (
    <a href={to} {...props}>
      {children as never}
    </a>
  ),
}));

const DEFAULT_ABOUT_CONTENT_FOR_TEST: AboutPageContent = {
  hero: { eyebrow: "e", title: "領養代替購買", description: "d" },
  mission: { eyebrow: "e", title: "t", body: "b", sideBadge: "s", sideBody: "s" },
  impact: { eyebrow: "e", title: "t", description: "d" },
  journey: {
    eyebrow: "e",
    title: "t",
    steps: [
      { title: "1", description: "d" },
      { title: "2", description: "d" },
      { title: "3", description: "d" },
      { title: "4", description: "d" },
    ],
  },
  communityBand: {
    eyebrow: "e",
    title: "t",
    description: "d",
    cccpCard: { title: "t", description: "d" },
    tnrCard: { title: "t", description: "d" },
  },
  responsibleAdoption: {
    eyebrow: "e",
    title: "t",
    body: "b",
    linkLabel: "l",
    sideTitle: "s",
    principles: ["1", "2", "3"],
  },
  helpPaths: {
    eyebrow: "e",
    title: "t",
    items: [
      { title: "1", description: "d", label: "l" },
      { title: "2", description: "d", label: "l" },
      { title: "3", description: "d", label: "l" },
      { title: "4", description: "d", label: "l" },
    ],
  },
  closing: { title: "t", description: "d", buttonLabel: "b" },
};

describe("AboutContent", () => {
  test("renders the approved mission sequence without unverified legacy figures", () => {
    const markup = renderToStaticMarkup(<AboutContent impact={[]} />);

    expect(markup).toContain("領養代替購買");
    expect(markup).toContain("救援");
    expect(markup).toContain("醫療照護");
    expect(markup).toContain("絕育");
    expect(markup).toContain("配對領養");
    expect(markup).not.toContain("每年救助超過 600");
    expect(markup).not.toContain("6,800");
  });

  test("falls back to the default content when no content prop is given", () => {
    const markup = renderToStaticMarkup(<AboutContent impact={[]} />);
    expect(markup).toContain("讓每一個生命都有重新開始的機會");
  });

  test("renders loaded content in place of the default when provided", () => {
    const custom = {
      ...DEFAULT_ABOUT_CONTENT_FOR_TEST,
      hero: { ...DEFAULT_ABOUT_CONTENT_FOR_TEST.hero, title: "自訂標題" },
    };
    const markup = renderToStaticMarkup(<AboutContent impact={[]} content={custom} />);
    expect(markup).toContain("自訂標題");
    expect(markup).not.toContain("領養代替購買");
  });
});
