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
  hero: { eyebrow: "自訂Hero眉題", title: "自訂Hero標題", description: "自訂Hero描述" },
  mission: {
    eyebrow: "自訂使命眉題",
    title: "自訂使命標題",
    body: "自訂使命內文",
    sideBadge: "自訂使命側欄徽章",
    sideBody: "自訂使命側欄內文",
  },
  impact: { eyebrow: "自訂成效眉題", title: "自訂成效標題", description: "自訂成效描述" },
  journey: {
    eyebrow: "自訂旅程眉題",
    title: "自訂旅程標題",
    steps: [
      { title: "自訂步驟一標題", description: "自訂步驟一描述" },
      { title: "自訂步驟二標題", description: "自訂步驟二描述" },
      { title: "自訂步驟三標題", description: "自訂步驟三描述" },
      { title: "自訂步驟四標題", description: "自訂步驟四描述" },
    ],
  },
  communityBand: {
    eyebrow: "自訂社區眉題",
    title: "自訂社區標題",
    description: "自訂社區描述",
    cccpCard: { title: "自訂CCCP標題", description: "自訂CCCP描述" },
    tnrCard: { title: "自訂TNR標題", description: "自訂TNR描述" },
  },
  responsibleAdoption: {
    eyebrow: "自訂領養眉題",
    title: "自訂領養標題",
    body: "自訂領養內文",
    linkLabel: "自訂領養連結文字",
    sideTitle: "自訂領養側欄標題",
    principles: ["自訂原則一", "自訂原則二", "自訂原則三"],
  },
  helpPaths: {
    eyebrow: "自訂途徑眉題",
    title: "自訂途徑標題",
    items: [
      { title: "自訂途徑一標題", description: "自訂途徑一描述", label: "自訂途徑一按鈕" },
      { title: "自訂途徑二標題", description: "自訂途徑二描述", label: "自訂途徑二按鈕" },
      { title: "自訂途徑三標題", description: "自訂途徑三描述", label: "自訂途徑三按鈕" },
      { title: "自訂途徑四標題", description: "自訂途徑四描述", label: "自訂途徑四按鈕" },
    ],
  },
  closing: { title: "自訂結尾標題", description: "自訂結尾描述", buttonLabel: "自訂結尾按鈕" },
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

    // Distinct, per-field fixture values (rather than shared placeholders) so a
    // swapped cccpCard/tnrCard assignment, a shifted icon/href index, or a field
    // transposition in the component would actually fail this test.
    expect(markup).toContain("自訂CCCP標題");
    expect(markup).toContain("自訂CCCP描述");
    expect(markup).toContain("自訂TNR標題");
    expect(markup).toContain("自訂TNR描述");
    expect(markup).toContain("自訂步驟一標題");
    expect(markup).toContain("自訂步驟一描述");
    expect(markup).toContain("自訂步驟二標題");
    expect(markup).toContain("自訂步驟二描述");
    expect(markup).toContain("自訂途徑一標題");
    expect(markup).toContain("自訂途徑一按鈕");
    // Catches an index-shift bug in the HELP_PATH_HREFS zip.
    expect(markup).toContain('href="/animals/cat"');
  });
});
